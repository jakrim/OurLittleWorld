import { getMediaDatabase } from './mediaDb';
import {
  buildCandidateClusters,
  CANDIDATE_BATCH_SIZE,
  CANDIDATE_SCORER_VERSION,
  normalizeDiscoveryCandidate,
} from './candidateLedgerModel';
import { buildNightlyQueue, NIGHTLY_QUEUE_GENERATION_VERSION } from './nightlyQueueModel';

export const NIGHTLY_CANDIDATE_QUERY_LIMIT = 900;
export const NIGHTLY_DRAFT_MAX_LENGTH = 280;

export function listCachedAnalysisAssetIds({
  familyId,
  userId,
  sinceMs = null,
  scorerVersion = CANDIDATE_SCORER_VERSION,
  limit = 10000,
}) {
  assertScope(familyId, userId);
  const rows = getMediaDatabase().getAllSync(
    `select asset_id from discovery_candidates
     where family_id = ? and user_id = ? and scorer_version = ?
       and availability = 'available' and (? is null or capture_time_ms >= ?)
     order by capture_time_ms desc limit ?`,
    [familyId, userId, scorerVersion, sinceMs, sinceMs, Math.max(1, Math.min(10000, Number(limit || 10000)))],
  );
  return new Set(rows.map((row) => row.asset_id).filter(Boolean));
}

export function persistScanCandidates({ familyId, userId, scanKey, matches = [], now = new Date(), birthdayISO = null }) {
  assertScope(familyId, userId);
  const normalized = matches
    .map((match) => normalizeDiscoveryCandidate(match, { scanKey, now, birthdayISO }))
    .filter(Boolean);
  if (!normalized.length) return { persisted: 0, clusters: 0 };
  const database = getMediaDatabase();
  const clusterCount = buildCandidateClusters(normalized).length;

  for (let offset = 0; offset < normalized.length; offset += CANDIDATE_BATCH_SIZE) {
    const batch = normalized.slice(offset, offset + CANDIDATE_BATCH_SIZE);
    database.withTransactionSync(() => {
      for (const candidate of batch) upsertCandidate(database, familyId, userId, candidate);
      persistClusters(database, familyId, userId, buildCandidateClusters(batch), now.toISOString());
    });
  }
  return { persisted: normalized.length, clusters: clusterCount };
}

export function markCandidatesUnavailable({ familyId, userId, assetIds = [], reason = 'icloud_pending' }) {
  assertScope(familyId, userId);
  const ids = [...new Set(assetIds.filter(Boolean))];
  if (!ids.length) return 0;
  const database = getMediaDatabase();
  const stamp = new Date().toISOString();
  database.withTransactionSync(() => {
    for (const assetId of ids) {
      const current = database.getFirstSync(
        'select lifecycle_state from discovery_candidates where family_id = ? and user_id = ? and asset_id = ?',
        [familyId, userId, assetId],
      );
      if (['kept', 'skipped', 'rejected'].includes(current?.lifecycle_state)) continue;
      database.runSync(
        `insert into discovery_candidates (
           family_id, user_id, asset_id, media_type, availability, scorer_version,
           lifecycle_state, scan_key, first_seen_at, last_analyzed_at, unavailable_reason
         ) values (?, ?, ?, 'image', 'icloud_pending', ?, 'unavailable', null, ?, ?, ?)
         on conflict(family_id, user_id, asset_id) do update set
           availability = 'icloud_pending', lifecycle_state = 'unavailable',
           unavailable_reason = excluded.unavailable_reason, last_analyzed_at = excluded.last_analyzed_at`,
        [familyId, userId, assetId, CANDIDATE_SCORER_VERSION, stamp, stamp, reason],
      );
      database.runSync(
        `update nightly_review_items set item_state = 'unavailable', last_error_code = 'asset_unavailable', updated_at = ?
         where family_id = ? and user_id = ? and asset_id = ? and item_state in ('queued', 'shown')`,
        [stamp, familyId, userId, assetId],
      );
    }
  });
  return ids.length;
}

export function restoreCandidatesAvailable({ familyId, userId, assetIds = [] }) {
  assertScope(familyId, userId);
  const ids = [...new Set(assetIds.filter(Boolean))];
  const database = getMediaDatabase();
  database.withTransactionSync(() => {
    for (const assetId of ids) {
      database.runSync(
        `update discovery_candidates set availability = 'available',
           lifecycle_state = case when lifecycle_state = 'unavailable' then 'discovered' else lifecycle_state end,
           unavailable_reason = null, last_analyzed_at = ?
         where family_id = ? and user_id = ? and asset_id = ?`,
        [new Date().toISOString(), familyId, userId, assetId],
      );
    }
  });
  return ids.length;
}

export function restoreCandidateMedia({ familyId, userId, assetId, localUri, previewUri = null }) {
  assertScope(familyId, userId);
  if (!assetId || !localUri) return false;
  const database = getMediaDatabase();
  const stamp = new Date().toISOString();
  database.withTransactionSync(() => {
    database.runSync(
      `update discovery_candidates set availability = 'available', local_uri = ?, preview_uri = ?,
         lifecycle_state = case when lifecycle_state = 'unavailable' then 'shown' else lifecycle_state end,
         unavailable_reason = null, last_analyzed_at = ?
       where family_id = ? and user_id = ? and asset_id = ?`,
      [localUri, previewUri || localUri, stamp, familyId, userId, assetId],
    );
    database.runSync(
      `update nightly_review_items set item_state = 'shown', last_error_code = null, updated_at = ?
       where family_id = ? and user_id = ? and asset_id = ? and item_state = 'unavailable'`,
      [stamp, familyId, userId, assetId],
    );
  });
  return true;
}

export function markCandidateDecisions({ familyId, userId, keptAssetIds = [], skippedAssetIds = [] }) {
  assertScope(familyId, userId);
  const database = getMediaDatabase();
  const stamp = new Date().toISOString();
  database.withTransactionSync(() => {
    for (const assetId of [...new Set(keptAssetIds.filter(Boolean))]) {
      updateCandidateDecision(database, { familyId, userId, assetId, state: 'kept', stamp });
    }
    for (const assetId of [...new Set(skippedAssetIds.filter(Boolean))]) {
      updateCandidateDecision(database, { familyId, userId, assetId, state: 'skipped', stamp });
    }
  });
}

export function ensureNightlySession({
  familyId,
  userId,
  now = new Date(),
  timezone = resolvedTimeZone(),
  seed = localDay(now),
} = {}) {
  assertScope(familyId, userId);
  const database = getMediaDatabase();
  const existing = readActiveSession(database, familyId, userId);
  if (existing) return hydrateSession(database, existing);
  const completedToday = readCompletedSessionForDay(database, familyId, userId, localDay(now));
  if (completedToday) return hydrateSession(database, completedToday);

  const candidates = listEligibleCandidates(database, familyId, userId);
  const queue = buildNightlyQueue(candidates, { nowMs: now.getTime(), seed });
  if (!queue.length) return null;
  const sessionId = uuid();
  const stamp = now.toISOString();

  try {
    database.withTransactionSync(() => {
      const raced = readActiveSession(database, familyId, userId);
      if (raced) throw new ActiveSessionRaceError();
      database.runSync(
        `insert into nightly_review_sessions (
           session_id, family_id, user_id, local_day, timezone, seed, status,
           generation_version, model_version, current_position, item_count, created_at, updated_at
         ) values (?, ?, ?, ?, ?, ?, 'active', ?, ?, 0, ?, ?, ?)`,
        [sessionId, familyId, userId, localDay(now), timezone, seed, NIGHTLY_QUEUE_GENERATION_VERSION,
          CANDIDATE_SCORER_VERSION, queue.length, stamp, stamp],
      );
      for (const item of queue) {
        database.runSync(
          `insert into nightly_review_items (
             session_id, position, family_id, user_id, asset_id, reason_code, item_state, updated_at
           ) values (?, ?, ?, ?, ?, ?, 'queued', ?)`,
          [sessionId, item.position, familyId, userId, item.assetId, item.reasonCode, stamp],
        );
        database.runSync(
          `update discovery_candidates set lifecycle_state = 'queued', queued_at = ?,
             selection_reason_code = ?, last_analyzed_at = last_analyzed_at
           where family_id = ? and user_id = ? and asset_id = ? and lifecycle_state = 'eligible'`,
          [stamp, item.reasonCode, familyId, userId, item.assetId],
        );
      }
    });
  } catch (error) {
    const active = readActiveSession(database, familyId, userId);
    if (error instanceof ActiveSessionRaceError || active) return active ? hydrateSession(database, active) : null;
    throw error;
  }
  return hydrateSession(database, readActiveSession(database, familyId, userId));
}

export function getTonightSummary({ familyId, userId }) {
  if (!familyId || !userId) return null;
  const database = getMediaDatabase();
  const active = readActiveSession(database, familyId, userId);
  if (active) {
    const remaining = database.getFirstSync(
      `select count(*) as count from nightly_review_items
       where session_id = ? and item_state in ('queued', 'shown', 'unavailable')`,
      [active.session_id],
    );
    return { sessionId: active.session_id, count: Number(remaining?.count || 0), status: active.status };
  }
  const completedToday = readCompletedSessionForDay(database, familyId, userId, localDay(new Date()));
  if (completedToday) return { sessionId: completedToday.session_id, count: 0, status: 'completed' };
  const eligible = database.getFirstSync(
    `select count(*) as count from discovery_candidates
     where family_id = ? and user_id = ? and lifecycle_state = 'eligible' and availability = 'available'`,
    [familyId, userId],
  );
  return { sessionId: null, count: Math.min(7, Number(eligible?.count || 0)), status: 'available' };
}

export function readTonightSession({ familyId, userId }) {
  assertScope(familyId, userId);
  const database = getMediaDatabase();
  const active = readActiveSession(database, familyId, userId);
  return active ? hydrateSession(database, active) : null;
}

export function markTonightItemShown({ sessionId, familyId, userId, position }) {
  assertScope(familyId, userId);
  const database = getMediaDatabase();
  const stamp = new Date().toISOString();
  database.withTransactionSync(() => {
    const item = scopedItem(database, { sessionId, familyId, userId, position });
    if (!item || !['queued', 'shown'].includes(item.item_state)) return;
    database.runSync(
      `update nightly_review_items set item_state = 'shown', shown_at = coalesce(shown_at, ?), updated_at = ?
       where session_id = ? and position = ?`,
      [stamp, stamp, sessionId, position],
    );
    database.runSync(
      `update discovery_candidates set lifecycle_state = 'shown', shown_at = coalesce(shown_at, ?)
       where family_id = ? and user_id = ? and asset_id = ? and lifecycle_state in ('queued', 'shown')`,
      [stamp, familyId, userId, item.asset_id],
    );
  });
}

export function saveTonightDraft({ sessionId, familyId, userId, position, text }) {
  assertScope(familyId, userId);
  const safeText = String(text || '').slice(0, NIGHTLY_DRAFT_MAX_LENGTH);
  getMediaDatabase().runSync(
    `update nightly_review_items set draft_text = ?, updated_at = ?
     where session_id = ? and family_id = ? and user_id = ? and position = ?`,
    [safeText, new Date().toISOString(), sessionId, familyId, userId, position],
  );
  return safeText;
}

export function beginTonightKeep({ sessionId, familyId, userId, position }) {
  assertScope(familyId, userId);
  const database = getMediaDatabase();
  const item = scopedItem(database, { sessionId, familyId, userId, position });
  if (!item) throw new Error('Tonight memory is no longer available');
  if (item.item_state === 'kept') return { alreadyComplete: true, item: mapSessionItem(item) };
  database.runSync(
    `update nightly_review_items set commit_state = 'saving', last_error_code = null, updated_at = ?
     where session_id = ? and position = ? and item_state in ('queued', 'shown')`,
    [new Date().toISOString(), sessionId, position],
  );
  return { alreadyComplete: false, item: mapSessionItem(scopedItem(database, { sessionId, familyId, userId, position })) };
}

export function failTonightKeep({ sessionId, familyId, userId, position, errorCode = 'save_failed' }) {
  assertScope(familyId, userId);
  getMediaDatabase().runSync(
    `update nightly_review_items set commit_state = 'failed', last_error_code = ?, updated_at = ?
     where session_id = ? and family_id = ? and user_id = ? and position = ? and item_state not in ('kept', 'skipped')`,
    [String(errorCode).slice(0, 80), new Date().toISOString(), sessionId, familyId, userId, position],
  );
}

export function finishTonightKeep({ sessionId, familyId, userId, position }) {
  return finishDecision({ sessionId, familyId, userId, position, decision: 'kept' });
}

export function skipTonightItem({ sessionId, familyId, userId, position }) {
  return finishDecision({ sessionId, familyId, userId, position, decision: 'skipped' });
}

export function replaceTonightItemWithParentPick({ sessionId, familyId, userId, position, asset, now = new Date() }) {
  assertScope(familyId, userId);
  const assetId = asset?.assetId || asset?.asset_id;
  if (!assetId) throw new Error('The selected photo is missing its library identifier');
  const candidate = normalizeDiscoveryCandidate({
    assetId,
    mediaType: asset.type === 'video' || asset.mediaType === 'video' ? 'video' : 'image',
    localUri: asset.uri,
    uri: asset.uri,
    creationTime: asset.creationTime || now.getTime(),
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
    score: 1,
    captureQuality: 1,
    parentPinned: true,
  }, { scanKey: 'parent-picker', now });
  const database = getMediaDatabase();
  database.withTransactionSync(() => {
    upsertCandidate(database, familyId, userId, candidate);
    const current = scopedItem(database, { sessionId, familyId, userId, position });
    if (!current || ['kept', 'skipped'].includes(current.item_state)) throw new Error('This Tonight card is already finished');
    if (['saving', 'failed'].includes(current.commit_state) && current.last_error_code !== 'asset_unavailable') {
      throw new Error('Finish retrying this Keep before choosing another memory');
    }
    updateCandidateDecision(database, {
      familyId,
      userId,
      assetId: current.asset_id,
      state: 'skipped',
      stamp: now.toISOString(),
    });
    database.runSync(
      `update discovery_candidates set lifecycle_state = 'eligible', selection_reason_code = 'parent_pick'
       where family_id = ? and user_id = ? and asset_id = ?`,
      [familyId, userId, assetId],
    );
    database.runSync(
      `update nightly_review_items set asset_id = ?, reason_code = 'parent_pick', item_state = 'shown',
         commit_state = 'idle', draft_text = null, shown_at = ?, updated_at = ?
       where session_id = ? and position = ?`,
      [assetId, now.toISOString(), now.toISOString(), sessionId, position],
    );
  });
  return hydrateSession(database, readActiveSession(database, familyId, userId));
}

function finishDecision({ sessionId, familyId, userId, position, decision }) {
  assertScope(familyId, userId);
  const database = getMediaDatabase();
  const stamp = new Date().toISOString();
  database.withTransactionSync(() => {
    const item = scopedItem(database, { sessionId, familyId, userId, position });
    if (!item) throw new Error('Tonight memory is no longer available');
    if (item.item_state === decision) return;
    if (['kept', 'skipped'].includes(item.item_state)) throw new Error('This Tonight memory already has a decision');
    if (decision === 'skipped' && ['saving', 'failed'].includes(item.commit_state)
      && item.last_error_code !== 'asset_unavailable') {
      throw new Error('Finish retrying this Keep before skipping the memory');
    }
    database.runSync(
      `update nightly_review_items set item_state = ?, commit_state = 'done', decided_at = ?, updated_at = ?
       where session_id = ? and position = ?`,
      [decision, stamp, stamp, sessionId, position],
    );
    updateCandidateDecision(database, { familyId, userId, assetId: item.asset_id, state: decision, stamp });
    const nextPosition = Math.min(Number(position) + 1, Number(item.item_count || position + 1));
    const remaining = database.getFirstSync(
      `select count(*) as count from nightly_review_items
       where session_id = ? and item_state in ('queued', 'shown', 'unavailable')`,
      [sessionId],
    );
    const completed = Number(remaining?.count || 0) === 0;
    database.runSync(
      `update nightly_review_sessions set current_position = ?, status = ?, completed_at = ?, updated_at = ?
       where session_id = ? and family_id = ? and user_id = ?`,
      [nextPosition, completed ? 'completed' : 'active', completed ? stamp : null, stamp, sessionId, familyId, userId],
    );
  });
  const active = readActiveSession(database, familyId, userId);
  return active ? hydrateSession(database, active) : { completed: true, items: [] };
}

function listEligibleCandidates(database, familyId, userId) {
  const rows = database.getAllSync(
    `with scoped as (
       select c.*, not exists (
         select 1 from media_items m
         where m.family_id = c.family_id and m.moment_id is not null
           and (date(m.creation_time, 'localtime') = c.local_day or substr(m.creation_time, 1, 10) = c.local_day)
       ) as coverage_needed
       from discovery_candidates c
       where c.family_id = ? and c.user_id = ? and c.lifecycle_state = 'eligible' and c.availability = 'available'
         and (c.representative_asset_id is null or c.representative_asset_id = c.asset_id)
     ), ranked as (
       select *, row_number() over (
         partition by local_day order by capture_quality desc, identity_score desc, capture_time_ms desc, asset_id asc
       ) as day_rank
       from scoped
     )
     select * from ranked where day_rank <= 2 or media_type = 'video'
     order by capture_time_ms desc, asset_id asc limit ?`,
    [familyId, userId, NIGHTLY_CANDIDATE_QUERY_LIMIT],
  );
  return rows.map(mapCandidateRow);
}

function readActiveSession(database, familyId, userId) {
  return database.getFirstSync(
    `select * from nightly_review_sessions
     where family_id = ? and user_id = ? and status = 'active'
     order by created_at asc limit 1`,
    [familyId, userId],
  );
}

function readCompletedSessionForDay(database, familyId, userId, day) {
  return database.getFirstSync(
    `select * from nightly_review_sessions
     where family_id = ? and user_id = ? and local_day = ? and status = 'completed'
     order by completed_at desc limit 1`,
    [familyId, userId, day],
  );
}

function hydrateSession(database, session) {
  if (!session) return null;
  const rows = database.getAllSync(
    `select i.*, c.media_type, c.local_uri, c.preview_uri, c.availability, c.capture_time_ms,
       c.local_day, c.duration_sec, c.width, c.height, c.identity_score, c.capture_quality,
       c.video_presence_ratio, c.unavailable_reason, c.event_cluster_key, c.cluster_member_count
     from nightly_review_items i
     join discovery_candidates c on c.family_id = i.family_id and c.user_id = i.user_id and c.asset_id = i.asset_id
     where i.session_id = ? order by i.position asc`,
    [session.session_id],
  );
  return {
    sessionId: session.session_id,
    familyId: session.family_id,
    userId: session.user_id,
    localDay: session.local_day,
    timezone: session.timezone,
    status: session.status,
    currentPosition: Number(session.current_position || 0),
    itemCount: Number(session.item_count || rows.length),
    completed: session.status === 'completed',
    items: rows.map(mapSessionItem),
  };
}

function scopedItem(database, { sessionId, familyId, userId, position }) {
  return database.getFirstSync(
    `select i.*, s.item_count from nightly_review_items i
     join nightly_review_sessions s on s.session_id = i.session_id
     where i.session_id = ? and i.position = ? and i.family_id = ? and i.user_id = ?`,
    [sessionId, position, familyId, userId],
  );
}

function mapSessionItem(row) {
  return {
    sessionId: row.session_id,
    position: Number(row.position || 0),
    assetId: row.asset_id,
    reasonCode: row.reason_code,
    state: row.item_state,
    commitState: row.commit_state,
    draftText: row.draft_text || '',
    lastErrorCode: row.last_error_code || null,
    mediaType: row.media_type || 'image',
    localUri: row.local_uri || row.preview_uri || null,
    previewUri: row.preview_uri || row.local_uri || null,
    availability: row.availability || 'available',
    captureTimeMs: Number(row.capture_time_ms || 0) || null,
    localDay: row.local_day || null,
    durationSec: Number(row.duration_sec || 0) || null,
    width: Number(row.width || 0) || null,
    height: Number(row.height || 0) || null,
    unavailableReason: row.unavailable_reason || null,
  };
}

function mapCandidateRow(row) {
  return {
    assetId: row.asset_id,
    mediaType: row.media_type,
    availability: row.availability,
    captureTimeMs: Number(row.capture_time_ms || 0),
    localDay: row.local_day,
    durationSec: Number(row.duration_sec || 0),
    identityScore: Number(row.identity_score || 0),
    captureQuality: Number(row.capture_quality || 0),
    videoPresenceRatio: Number(row.video_presence_ratio || 0),
    eventClusterKey: row.event_cluster_key,
    clusterMemberCount: Number(row.cluster_member_count || 1),
    coverageNeeded: Number(row.coverage_needed || 0) === 1,
    lifecycleState: row.lifecycle_state,
    selectionReasonCode: row.selection_reason_code,
  };
}

function upsertCandidate(database, familyId, userId, candidate) {
  database.runSync(
    `insert into discovery_candidates (
       family_id, user_id, asset_id, media_type, local_uri, preview_uri, availability,
       capture_time_ms, local_day, width, height, duration_sec, identity_score, identity_band,
       face_count, capture_quality, face_size_ratio, sharpness, smile_score, video_presence_ratio,
       video_sampled_frames, video_matched_frames, visual_fingerprint_json, identity_evidence_json,
       event_cluster_key, representative_asset_id, cluster_member_count, scorer_version,
       selection_reason_code, lifecycle_state, scan_key, first_seen_at, last_analyzed_at, unavailable_reason
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(family_id, user_id, asset_id) do update set
       media_type = excluded.media_type, local_uri = coalesce(excluded.local_uri, discovery_candidates.local_uri),
       preview_uri = coalesce(excluded.preview_uri, discovery_candidates.preview_uri), availability = excluded.availability,
       capture_time_ms = coalesce(excluded.capture_time_ms, discovery_candidates.capture_time_ms),
       local_day = coalesce(excluded.local_day, discovery_candidates.local_day), width = coalesce(excluded.width, discovery_candidates.width),
       height = coalesce(excluded.height, discovery_candidates.height), duration_sec = coalesce(excluded.duration_sec, discovery_candidates.duration_sec),
       identity_score = excluded.identity_score, identity_band = excluded.identity_band, face_count = excluded.face_count,
       capture_quality = excluded.capture_quality, face_size_ratio = excluded.face_size_ratio, sharpness = excluded.sharpness,
       smile_score = excluded.smile_score, video_presence_ratio = excluded.video_presence_ratio,
       video_sampled_frames = excluded.video_sampled_frames, video_matched_frames = excluded.video_matched_frames,
       visual_fingerprint_json = excluded.visual_fingerprint_json, identity_evidence_json = excluded.identity_evidence_json,
       event_cluster_key = excluded.event_cluster_key, representative_asset_id = excluded.representative_asset_id,
       cluster_member_count = excluded.cluster_member_count, scorer_version = excluded.scorer_version,
       selection_reason_code = case when discovery_candidates.lifecycle_state in ('kept','skipped','queued','shown')
         then discovery_candidates.selection_reason_code else excluded.selection_reason_code end,
       lifecycle_state = case when discovery_candidates.lifecycle_state in ('kept','skipped','queued','shown')
         then discovery_candidates.lifecycle_state else excluded.lifecycle_state end,
       scan_key = excluded.scan_key, last_analyzed_at = excluded.last_analyzed_at,
       unavailable_reason = excluded.unavailable_reason`,
    [familyId, userId, candidate.assetId, candidate.mediaType, candidate.localUri, candidate.previewUri,
      candidate.availability, candidate.captureTimeMs, candidate.localDay, candidate.width, candidate.height,
      candidate.durationSec, candidate.identityScore, candidate.identityBand, candidate.faceCount,
      candidate.captureQuality, candidate.faceSizeRatio, candidate.sharpness, candidate.smileScore,
      candidate.videoPresenceRatio, candidate.videoSampledFrames, candidate.videoMatchedFrames,
      candidate.visualFingerprintJson, candidate.identityEvidenceJson, candidate.eventClusterKey,
      candidate.representativeAssetId, candidate.clusterMemberCount, candidate.scorerVersion,
      candidate.selectionReasonCode, candidate.lifecycleState, candidate.scanKey, candidate.firstSeenAt,
      candidate.lastAnalyzedAt, candidate.unavailableReason],
  );
}

function persistClusters(database, familyId, userId, clusters, stamp) {
  for (const cluster of clusters) {
      const lockedRepresentative = database.getFirstSync(
        `select cc.representative_asset_id as asset_id
         from candidate_clusters cc
         join discovery_candidates c on c.family_id = cc.family_id and c.user_id = cc.user_id
           and c.asset_id = cc.representative_asset_id
         where cc.family_id = ? and cc.user_id = ? and cc.cluster_id = ?
           and c.lifecycle_state in ('queued', 'shown', 'kept', 'skipped')`,
        [familyId, userId, cluster.clusterId],
      );
      database.runSync(
        `insert into candidate_clusters (
           family_id, user_id, cluster_id, representative_asset_id, member_count, cluster_kind, scorer_version, updated_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(family_id, user_id, cluster_id) do update set
           representative_asset_id = excluded.representative_asset_id,
           member_count = excluded.member_count, cluster_kind = excluded.cluster_kind,
           scorer_version = excluded.scorer_version, updated_at = excluded.updated_at`,
        [familyId, userId, cluster.clusterId, cluster.representativeAssetId, cluster.memberCount,
          cluster.clusterKind, CANDIDATE_SCORER_VERSION, stamp],
      );
      for (const member of cluster.members) {
        database.runSync(
          `insert into candidate_cluster_members (
             family_id, user_id, cluster_id, asset_id, is_representative, updated_at
           ) values (?, ?, ?, ?, ?, ?)
           on conflict(family_id, user_id, cluster_id, asset_id) do update set
             is_representative = excluded.is_representative, updated_at = excluded.updated_at`,
          [familyId, userId, cluster.clusterId, member.assetId, member.isRepresentative ? 1 : 0, stamp],
        );
      }
      const representative = database.getFirstSync(
        `select m.asset_id, count(*) over () as member_count
         from candidate_cluster_members m
         join discovery_candidates c on c.family_id = m.family_id and c.user_id = m.user_id and c.asset_id = m.asset_id
         where m.family_id = ? and m.user_id = ? and m.cluster_id = ?
         order by c.capture_quality desc, c.identity_score desc, c.capture_time_ms desc, c.asset_id asc limit 1`,
        [familyId, userId, cluster.clusterId],
      );
      const representativeId = lockedRepresentative?.asset_id || representative?.asset_id || cluster.representativeAssetId;
      const memberCount = Number(representative?.member_count || cluster.memberCount);
      database.runSync(
        `update candidate_clusters set representative_asset_id = ?, member_count = ?, updated_at = ?
         where family_id = ? and user_id = ? and cluster_id = ?`,
        [representativeId, memberCount, stamp, familyId, userId, cluster.clusterId],
      );
      database.runSync(
        `update candidate_cluster_members set is_representative = case when asset_id = ? then 1 else 0 end, updated_at = ?
         where family_id = ? and user_id = ? and cluster_id = ?`,
        [representativeId, stamp, familyId, userId, cluster.clusterId],
      );
      database.runSync(
        `update discovery_candidates set representative_asset_id = ?, cluster_member_count = ?
         where family_id = ? and user_id = ? and asset_id in (
           select asset_id from candidate_cluster_members where family_id = ? and user_id = ? and cluster_id = ?
         )`,
        [representativeId, memberCount, familyId, userId, familyId, userId, cluster.clusterId],
      );
      database.runSync(
        `update discovery_candidates set
           lifecycle_state = case
             when lifecycle_state in ('kept', 'skipped', 'queued', 'shown', 'unavailable') then lifecycle_state
             when asset_id = ? then case when lifecycle_state = 'superseded' then 'eligible' else lifecycle_state end
             else 'superseded'
           end,
           superseded_by_asset_id = case when asset_id = ? then null else ? end
         where family_id = ? and user_id = ? and asset_id in (
           select asset_id from candidate_cluster_members where family_id = ? and user_id = ? and cluster_id = ?
         )`,
        [representativeId, representativeId, representativeId, familyId, userId, familyId, userId, cluster.clusterId],
      );
  }
}

function updateCandidateDecision(database, { familyId, userId, assetId, state, stamp }) {
  database.runSync(
    `update discovery_candidates set lifecycle_state = ?, decided_at = ?, last_analyzed_at = last_analyzed_at
     where family_id = ? and user_id = ? and asset_id = ?
       and lifecycle_state not in ('kept', 'skipped', 'rejected')`,
    [state, stamp, familyId, userId, assetId],
  );
}

function assertScope(familyId, userId) {
  if (!familyId || !userId) throw new Error('A family and parent are required for private discovery');
}

function localDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function resolvedTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `tonight-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

class ActiveSessionRaceError extends Error {}

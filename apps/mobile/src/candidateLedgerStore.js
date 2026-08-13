import { getMediaDatabase } from './mediaDb';
import {
  buildCandidateClusters,
  CANDIDATE_BATCH_SIZE,
  CANDIDATE_SCORER_VERSION,
  normalizeDiscoveryCandidate,
  PRESERVE_CANDIDATE_LIFECYCLE_ON_ANALYSIS_SQL,
} from './candidateLedgerModel';
import {
  buildNightlyQueue,
  NIGHTLY_QUEUE_FACE_SIZE_RATIO_FLOOR,
  NIGHTLY_QUEUE_GENERATION_VERSION,
  NIGHTLY_QUEUE_IDENTITY_FLOOR,
  NIGHTLY_QUEUE_QUALITY_FLOOR,
  NIGHTLY_QUEUE_SHARPNESS_FLOOR,
  shouldWithdrawStaleNightlyItem,
} from './nightlyQueueModel';
import { localDayInTimeZone, recommendedNightlySize } from './firstYearCatchupModel';
import { isNightlySessionContinuation } from './nightlySessionModel.js';
import {
  assertTonightKeepAbandonmentConfirmed,
  canAbandonTonightKeep,
} from './tonightKeepBoundaryModel.js';
import { reconcileCanonicalKeepInDatabase } from './canonicalKeepLedgerModel.js';

export const NIGHTLY_CANDIDATE_QUERY_LIMIT = 900;
export const NIGHTLY_DRAFT_MAX_LENGTH = 280;
export const NIGHTLY_BURST_ALTERNATE_LIMIT = 12;
export const NIGHTLY_BURST_ALTERNATE_MIN_QUALITY = 0.55;
export const DURABLE_ICLOUD_RETRY_LIMIT = 50;
export const CANDIDATE_UNAVAILABLE_CODES = Object.freeze([
  'icloud_pending',
  'deleted',
  'limited_revoked',
  'missing_after_full_scan',
]);
export const TONIGHT_REACTION_CODES = Object.freeze(['spark', 'seen']);
export const TONIGHT_COMMIT_STEPS = Object.freeze(['media', 'text', 'voice', 'reaction', 'collection']);
export const TONIGHT_COMMIT_STEP_STATES = Object.freeze(['idle', 'saving', 'saved', 'failed', 'skipped']);

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

export function persistScanCandidates({
  familyId,
  userId,
  scanKey,
  matches = [],
  now = new Date(),
  birthdayISO = null,
  captureTimezone = resolvedTimeZone(),
}) {
  assertScope(familyId, userId);
  const normalized = matches
    .map((match) => normalizeDiscoveryCandidate(match, { scanKey, now, birthdayISO, captureTimezone }))
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

export function markCandidatesUnavailable({
  familyId,
  userId,
  assetIds = [],
  reason = 'Waiting for the original to download from iCloud.',
  code = 'icloud_pending',
}) {
  assertScope(familyId, userId);
  if (!CANDIDATE_UNAVAILABLE_CODES.includes(code)) throw new Error('Unknown candidate availability reason');
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
           lifecycle_state, scan_key, first_seen_at, last_analyzed_at, unavailable_reason, unavailable_code
         ) values (?, ?, ?, 'image', ?, ?, 'unavailable', null, ?, ?, ?, ?)
         on conflict(family_id, user_id, asset_id) do update set
           availability = excluded.availability, lifecycle_state = 'unavailable',
           unavailable_reason = excluded.unavailable_reason, unavailable_code = excluded.unavailable_code,
           local_uri = null, preview_uri = case when excluded.availability = 'unavailable' then null else preview_uri end,
           last_analyzed_at = excluded.last_analyzed_at`,
        [familyId, userId, assetId, code === 'icloud_pending' ? 'icloud_pending' : 'unavailable',
          CANDIDATE_SCORER_VERSION, stamp, stamp, reason, code],
      );
      database.runSync(
        `update nightly_review_items set item_state = 'unavailable', last_error_code = 'asset_unavailable', updated_at = ?
         where family_id = ? and user_id = ? and item_state in ('queued', 'shown')
           and (
             exists (
               select 1 from nightly_review_enrichment e
               where e.session_id = nightly_review_items.session_id
                 and e.position = nightly_review_items.position and e.selected_asset_id = ?
             )
             or (asset_id = ? and not exists (
               select 1 from nightly_review_enrichment e
               where e.session_id = nightly_review_items.session_id
                 and e.position = nightly_review_items.position and e.selected_asset_id is not null
             ))
           )`,
        [stamp, familyId, userId, assetId, assetId],
      );
    }
    promoteUnavailableClusterRepresentatives(database, { familyId, userId, stamp });
  });
  return ids.length;
}

export function markCandidatesDeleted({ familyId, userId, assetIds = [], limited = false }) {
  return markCandidatesUnavailable({
    familyId,
    userId,
    assetIds,
    code: limited ? 'limited_revoked' : 'deleted',
    reason: limited
      ? 'This photo is no longer shared with Our Little World.'
      : 'This photo is no longer in Photos.',
  });
}

export function markCandidatesSeen({ familyId, userId, assetIds = [], scanKey, seenAt = new Date() }) {
  assertScope(familyId, userId);
  if (!scanKey) return 0;
  const ids = [...new Set(assetIds.filter(Boolean))];
  if (!ids.length) return 0;
  const database = getMediaDatabase();
  const stamp = seenAt.toISOString();
  database.withTransactionSync(() => {
    for (const assetId of ids) {
      database.runSync(
        `update discovery_candidates set last_seen_scan_key = ?, last_seen_at = ?
         where family_id = ? and user_id = ? and asset_id = ?`,
        [scanKey, stamp, familyId, userId, assetId],
      );
    }
  });
  return ids.length;
}

export function reconcileCompletedFullScan({
  familyId,
  userId,
  scanKey,
  sinceMs = null,
  limited = false,
  now = new Date(),
}) {
  assertScope(familyId, userId);
  if (!scanKey) return 0;
  const database = getMediaDatabase();
  const stamp = now.toISOString();
  const code = limited ? 'limited_revoked' : 'missing_after_full_scan';
  const reason = limited
    ? 'This photo is no longer shared with Our Little World.'
    : 'This photo could not be found in the completed Photos scan.';
  let changed = 0;
  database.withTransactionSync(() => {
    database.runSync(
      `update discovery_candidates set availability = 'unavailable', lifecycle_state = 'unavailable',
         local_uri = null, preview_uri = null, unavailable_reason = ?, unavailable_code = ?, last_analyzed_at = ?
       where family_id = ? and user_id = ?
         and lifecycle_state not in ('kept', 'skipped', 'rejected')
         and (? is null or capture_time_ms >= ?)
         and coalesce(last_seen_scan_key, '') <> ?`,
      [reason, code, stamp, familyId, userId, sinceMs, sinceMs, scanKey],
    );
    changed = Number(database.getFirstSync('select changes() as count')?.count || 0);
    database.runSync(
      `update nightly_review_items set item_state = 'unavailable', last_error_code = 'asset_unavailable', updated_at = ?
       where family_id = ? and user_id = ? and item_state in ('queued', 'shown')
         and coalesce((
           select e.selected_asset_id from nightly_review_enrichment e
           where e.session_id = nightly_review_items.session_id
             and e.position = nightly_review_items.position
         ), asset_id) in (
           select asset_id from discovery_candidates
           where family_id = ? and user_id = ? and unavailable_code = ?
         )`,
      [stamp, familyId, userId, familyId, userId, code],
    );
    promoteUnavailableClusterRepresentatives(database, { familyId, userId, stamp });
  });
  return changed;
}

export function listDurableICloudRetryAssetIds({
  familyId,
  userId,
  limit = DURABLE_ICLOUD_RETRY_LIMIT,
} = {}) {
  assertScope(familyId, userId);
  const bounded = Math.max(1, Math.min(DURABLE_ICLOUD_RETRY_LIMIT, Number(limit || DURABLE_ICLOUD_RETRY_LIMIT)));
  return getMediaDatabase().getAllSync(
    `select asset_id from discovery_candidates
     where family_id = ? and user_id = ? and unavailable_code = 'icloud_pending'
       and lifecycle_state = 'unavailable'
     order by coalesce(last_seen_at, first_seen_at) asc, asset_id asc limit ?`,
    [familyId, userId, bounded],
  ).map((row) => row.asset_id).filter(Boolean);
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
           unavailable_reason = null, unavailable_code = null, last_analyzed_at = ?
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
      `update discovery_candidates set availability = 'available', local_uri = ?,
         preview_uri = coalesce(?, preview_uri, ?),
         source_recovery_required = 0,
         lifecycle_state = case when lifecycle_state = 'unavailable' then 'shown' else lifecycle_state end,
         unavailable_reason = null, unavailable_code = null, last_analyzed_at = ?
       where family_id = ? and user_id = ? and asset_id = ?`,
      [localUri, previewUri, localUri, stamp, familyId, userId, assetId],
    );
    database.runSync(
      `update nightly_review_items set item_state = 'shown', last_error_code = null, updated_at = ?
       where family_id = ? and user_id = ? and item_state = 'unavailable'
         and coalesce((
           select e.selected_asset_id from nightly_review_enrichment e
           where e.session_id = nightly_review_items.session_id
             and e.position = nightly_review_items.position
         ), asset_id) = ?`,
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

/**
 * Reconciles private discovery state only after a canonical Keep has published.
 * The kept tombstone makes both race orders safe: analysis that finished first
 * is overwritten, while analysis that arrives later preserves the final state
 * in `upsertCandidate`.
 *
 * Tonight's active item is deliberately preserved until its enrichment commit
 * and normal `finishTonightKeep` path complete. Any other queued occurrence of
 * the same effective asset is retired immediately.
 */
export function reconcileCanonicalKeep({
  familyId,
  userId,
  assetId,
  mediaType = 'image',
  activeTonightItem = null,
  now = new Date(),
}) {
  assertScope(familyId, userId);
  if (!assetId) throw new Error('A kept asset is required for candidate reconciliation');
  return reconcileCanonicalKeepInDatabase({
    database: getMediaDatabase(),
    familyId,
    userId,
    assetId,
    mediaType,
    activeTonightItem,
    now,
  });
}

export function ensureNightlySession({
  familyId,
  userId,
  now = new Date(),
  timezone = resolvedTimeZone(),
  seed = null,
} = {}) {
  assertScope(familyId, userId);
  const database = getMediaDatabase();
  const existing = readActiveSession(database, familyId, userId);
  if (existing) {
    revalidateActiveNightlySession(database, existing);
    const revalidated = readActiveSession(database, familyId, userId);
    if (revalidated) return hydrateSession(database, revalidated);
  }
  const day = localDayInTimeZone(now, timezone);
  const completedToday = readCompletedSessionForDay(database, familyId, userId, day);
  if (completedToday && !sessionHasQualityWithdrawals(database, completedToday.session_id)) {
    return hydrateSession(database, completedToday);
  }

  return createNightlySession(database, {
    familyId,
    userId,
    now,
    timezone,
    day,
    seed: seed || (completedToday ? `${day}:revalidated` : day),
    continuation: !!completedToday,
  });
}

export function startTonightContinuation({
  familyId,
  userId,
  now = new Date(),
  timezone = resolvedTimeZone(),
  completedSessionId = null,
} = {}) {
  assertScope(familyId, userId);
  const database = getMediaDatabase();
  const active = readActiveSession(database, familyId, userId);
  if (active) return hydrateSession(database, active);
  const completed = completedSessionId
    ? database.getFirstSync(
      `select * from nightly_review_sessions
       where session_id = ? and family_id = ? and user_id = ? and status = 'completed'`,
      [completedSessionId, familyId, userId],
    )
    : readCompletedSessionForDay(database, familyId, userId, localDayInTimeZone(now, timezone));
  if (!completed) throw new Error('Finish the current Tonight set before finding more');
  const day = completed.local_day;
  const sessionTimezone = completed.timezone || timezone;
  const sameDayCount = Number(database.getFirstSync(
    `select count(*) as count from nightly_review_sessions
     where family_id = ? and user_id = ? and local_day = ?`,
    [familyId, userId, day],
  )?.count || 0);
  return createNightlySession(database, {
    familyId,
    userId,
    now,
    timezone: sessionTimezone,
    day,
    seed: `${day}:more:${sameDayCount}`,
    continuation: true,
  });
}

function createNightlySession(database, {
  familyId,
  userId,
  now,
  timezone,
  day,
  seed,
  continuation,
}) {
  const queue = buildAvailableNightlyQueue(database, {
    familyId,
    userId,
    now,
    seed,
    continuation,
  });
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
           generation_version, model_version, current_position, item_count, created_at, updated_at,
           is_continuation
         ) values (?, ?, ?, ?, ?, ?, 'active', ?, ?, 0, ?, ?, ?, ?)`,
        [sessionId, familyId, userId, day, timezone, seed, NIGHTLY_QUEUE_GENERATION_VERSION,
          CANDIDATE_SCORER_VERSION, queue.length, stamp, stamp, continuation ? 1 : 0],
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

function buildAvailableNightlyQueue(database, {
  familyId,
  userId,
  now,
  seed,
  continuation = false,
}) {
  const stats = candidateBacklogStats(database, familyId, userId);
  const completedSessionCount = Number(database.getFirstSync(
    `select count(*) as count from nightly_review_sessions
     where family_id = ? and user_id = ? and status = 'completed'
       and is_continuation = 0`,
    [familyId, userId],
  )?.count || 0);
  const maxItems = recommendedNightlySize({
    eligibleCount: stats.eligibleCount,
    uncoveredDayCount: stats.uncoveredDayCount,
    completedSessionCount,
    continuation,
  });
  if (!maxItems) return [];

  const candidates = listEligibleCandidates(database, familyId, userId);
  return buildNightlyQueue(candidates, { nowMs: now.getTime(), seed, maxItems });
}

export function getTonightSummary({
  familyId,
  userId,
  now = new Date(),
  timezone = resolvedTimeZone(),
} = {}) {
  if (!familyId || !userId) return null;
  const database = getMediaDatabase();
  const existing = readActiveSession(database, familyId, userId);
  if (existing) revalidateActiveNightlySession(database, existing);
  const active = readActiveSession(database, familyId, userId);
  if (active) {
    const remaining = database.getFirstSync(
      `select count(*) as count from nightly_review_items
       where session_id = ? and item_state in ('queued', 'shown', 'unavailable')`,
      [active.session_id],
    );
    return { sessionId: active.session_id, count: Number(remaining?.count || 0), status: active.status };
  }
  const day = localDayInTimeZone(now, timezone);
  const completedToday = readCompletedSessionForDay(database, familyId, userId, day);
  if (completedToday) return { sessionId: completedToday.session_id, count: 0, status: 'completed' };
  const queue = buildAvailableNightlyQueue(database, {
    familyId,
    userId,
    now,
    seed: day,
  });
  return {
    sessionId: null,
    count: queue.length,
    status: 'available',
  };
}

export function getTonightCatchupSummary({ familyId, userId } = {}) {
  assertScope(familyId, userId);
  const database = getMediaDatabase();
  const stats = candidateBacklogStats(database, familyId, userId);
  const unavailable = Number(database.getFirstSync(
    `select count(*) as count from discovery_candidates
     where family_id = ? and user_id = ? and lifecycle_state = 'unavailable'`,
    [familyId, userId],
  )?.count || 0);
  return {
    remainingStrongCount: stats.eligibleCount,
    uncoveredEligibleDayCount: stats.uncoveredDayCount,
    unavailableCount: unavailable,
    hasMore: stats.eligibleCount > 0,
  };
}

export function replaceFamilySavedDayFacts({ familyId, dayCounts = new Map(), refreshedAt = new Date() } = {}) {
  if (!familyId) throw new Error('A family is required for saved-day coverage');
  const entries = dayCounts instanceof Map ? [...dayCounts.entries()] : Object.entries(dayCounts || {});
  const database = getMediaDatabase();
  const stamp = refreshedAt.toISOString();
  database.withTransactionSync(() => {
    database.runSync('delete from family_saved_day_facts where family_id = ?', [familyId]);
    for (const [day, count] of entries) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day)) || Number(count || 0) <= 0) continue;
      database.runSync(
        `insert into family_saved_day_facts (family_id, local_day, saved_count, refreshed_at)
         values (?, ?, ?, ?)`,
        [familyId, day, Number(count), stamp],
      );
    }
  });
  return entries.length;
}

export function readTonightSession({ familyId, userId }) {
  assertScope(familyId, userId);
  const database = getMediaDatabase();
  const existing = readActiveSession(database, familyId, userId);
  if (existing) revalidateActiveNightlySession(database, existing);
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
  const database = getMediaDatabase();
  const stamp = new Date().toISOString();
  database.withTransactionSync(() => {
    assertMutableItem(database, { sessionId, familyId, userId, position });
    ensureEnrichmentRow(database, { sessionId, familyId, userId, position, stamp });
    database.runSync(
      `update nightly_review_items set draft_text = ?, updated_at = ?
       where session_id = ? and family_id = ? and user_id = ? and position = ?`,
      [safeText, stamp, sessionId, familyId, userId, position],
    );
    database.runSync(
      `update nightly_review_enrichment set parent_interacted = 1, updated_at = ?
       where session_id = ? and position = ? and family_id = ? and user_id = ?`,
      [stamp, sessionId, position, familyId, userId],
    );
  });
  return safeText;
}

export function saveTonightVoiceDraft({
  sessionId,
  familyId,
  userId,
  position,
  voice = null,
}) {
  assertScope(familyId, userId);
  const database = getMediaDatabase();
  const stamp = new Date().toISOString();
  database.withTransactionSync(() => {
    assertMutableItem(database, { sessionId, familyId, userId, position });
    ensureEnrichmentRow(database, { sessionId, familyId, userId, position, stamp });
    database.runSync(
      `update nightly_review_enrichment set
         draft_voice_uri = ?, draft_voice_duration_sec = ?, draft_voice_mime_type = ?,
         draft_voice_waveform_json = ?, voice_commit_state = 'idle',
         canonical_voice_note_id = null, canonical_voice_object_id = null,
         retry_id = null, parent_interacted = 1, updated_at = ?
       where session_id = ? and position = ? and family_id = ? and user_id = ?`,
      [voice?.uri || null, voice?.durationSec || null, voice?.mimeType || null,
        voice?.waveform ? JSON.stringify(voice.waveform) : null, stamp,
        sessionId, position, familyId, userId],
    );
  });
  return readTonightSession({ familyId, userId });
}

export function saveTonightReactionDraft({
  sessionId,
  familyId,
  userId,
  position,
  favorite = false,
  reactionCode = null,
}) {
  assertScope(familyId, userId);
  const normalizedReaction = reactionCode == null ? null : String(reactionCode);
  if (normalizedReaction && !TONIGHT_REACTION_CODES.includes(normalizedReaction)) {
    throw new Error('That reaction is not available in Tonight');
  }
  const database = getMediaDatabase();
  const stamp = new Date().toISOString();
  database.withTransactionSync(() => {
    assertMutableItem(database, { sessionId, familyId, userId, position });
    ensureEnrichmentRow(database, { sessionId, familyId, userId, position, stamp });
    database.runSync(
      `update nightly_review_enrichment set draft_favorite = ?, draft_reaction_code = ?,
         reaction_commit_state = 'idle', retry_id = null, parent_interacted = 1, updated_at = ?
       where session_id = ? and position = ? and family_id = ? and user_id = ?`,
      [favorite ? 1 : 0, normalizedReaction, stamp, sessionId, position, familyId, userId],
    );
  });
  return readTonightSession({ familyId, userId });
}

export function saveTonightCollectionDraft({
  sessionId,
  familyId,
  userId,
  position,
  collectionKeys = [],
  parentInitiated = true,
}) {
  assertScope(familyId, userId);
  const normalized = [...new Set((collectionKeys || [])
    .map((key) => String(key || '').trim())
    .filter((key) => /^[a-z0-9:_-]{1,160}$/.test(key)))]
    .slice(0, 12);
  const database = getMediaDatabase();
  const stamp = new Date().toISOString();
  database.withTransactionSync(() => {
    assertMutableItem(database, { sessionId, familyId, userId, position });
    ensureEnrichmentRow(database, { sessionId, familyId, userId, position, stamp });
    database.runSync(
      `update nightly_review_enrichment set draft_collection_keys_json = ?,
         collection_commit_state = 'idle', retry_id = null,
         parent_interacted = case when ? then 1 else parent_interacted end, updated_at = ?
       where session_id = ? and position = ? and family_id = ? and user_id = ?`,
      [JSON.stringify(normalized), parentInitiated ? 1 : 0, stamp, sessionId, position, familyId, userId],
    );
  });
  return readTonightSession({ familyId, userId });
}

export function clearTonightVoiceDraft({ sessionId, familyId, userId, position }) {
  assertScope(familyId, userId);
  const database = getMediaDatabase();
  const current = scopedEnrichment(database, { sessionId, familyId, userId, position });
  if (!current) return { discardedVoiceUri: null, session: readTonightSession({ familyId, userId }) };
  assertMutableItem(database, { sessionId, familyId, userId, position });
  database.runSync(
    `update nightly_review_enrichment set draft_voice_uri = null, draft_voice_duration_sec = null,
       draft_voice_mime_type = null, draft_voice_waveform_json = null,
       voice_commit_state = 'idle', canonical_voice_note_id = null,
       canonical_voice_object_id = null, retry_id = null, updated_at = ?
     where session_id = ? and position = ? and family_id = ? and user_id = ?`,
    [new Date().toISOString(), sessionId, position, familyId, userId],
  );
  return {
    discardedVoiceUri: current.draft_voice_uri || null,
    session: readTonightSession({ familyId, userId }),
  };
}

export function listTonightBurstAlternates({
  sessionId,
  familyId,
  userId,
  position,
  limit = NIGHTLY_BURST_ALTERNATE_LIMIT,
}) {
  assertScope(familyId, userId);
  const database = getMediaDatabase();
  const item = scopedItem(database, { sessionId, familyId, userId, position });
  if (!item || item.reason_code !== 'best_burst') return [];
  const cluster = database.getFirstSync(
    `select event_cluster_key from discovery_candidates
     where family_id = ? and user_id = ? and asset_id = ?`,
    [familyId, userId, item.asset_id],
  );
  if (!cluster?.event_cluster_key) return [];
  const boundedLimit = Math.max(1, Math.min(NIGHTLY_BURST_ALTERNATE_LIMIT, Number(limit || NIGHTLY_BURST_ALTERNATE_LIMIT)));
  const rows = database.getAllSync(
    `select c.asset_id, c.local_uri, c.preview_uri, c.capture_time_ms, c.width, c.height,
       c.capture_quality, c.identity_score, c.lifecycle_state,
       case when c.asset_id = cc.representative_asset_id then 1 else 0 end as is_recommended
     from candidate_cluster_members m
     join candidate_clusters cc on cc.family_id = m.family_id and cc.user_id = m.user_id and cc.cluster_id = m.cluster_id
     join discovery_candidates c on c.family_id = m.family_id and c.user_id = m.user_id and c.asset_id = m.asset_id
     where m.family_id = ? and m.user_id = ? and m.cluster_id = ?
       and c.media_type = 'image' and c.availability = 'available' and c.local_uri is not null
       and c.identity_band = 'clear' and c.capture_quality >= ?
       and c.lifecycle_state not in ('kept', 'skipped', 'rejected', 'unavailable')
     order by is_recommended desc, c.capture_quality desc, c.identity_score desc,
       c.capture_time_ms desc, c.asset_id asc limit ?`,
    [familyId, userId, cluster.event_cluster_key, NIGHTLY_BURST_ALTERNATE_MIN_QUALITY, boundedLimit],
  );
  return rows.map((row) => ({
    assetId: row.asset_id,
    localUri: row.local_uri,
    previewUri: row.preview_uri || row.local_uri,
    captureTimeMs: Number(row.capture_time_ms || 0) || null,
    width: Number(row.width || 0) || null,
    height: Number(row.height || 0) || null,
    recommended: Number(row.is_recommended || 0) === 1,
    selected: (item.selected_asset_id || item.asset_id) === row.asset_id,
  }));
}

export function selectTonightBurstAlternate({
  sessionId,
  familyId,
  userId,
  position,
  assetId,
  remoteAbsenceConfirmed = false,
}) {
  assertScope(familyId, userId);
  const allowed = listTonightBurstAlternates({ sessionId, familyId, userId, position });
  if (!allowed.some((candidate) => candidate.assetId === assetId)) {
    throw new Error('That burst photo is no longer eligible');
  }
  const database = getMediaDatabase();
  const stamp = new Date().toISOString();
  database.withTransactionSync(() => {
    const current = assertMutableItem(database, { sessionId, familyId, userId, position });
    assertTonightKeepAbandonmentConfirmed(current, remoteAbsenceConfirmed);
    discardAbandonableUpload(database, { familyId, userId, item: current });
    ensureEnrichmentRow(database, { sessionId, familyId, userId, position, stamp });
    database.runSync(
      `update nightly_review_enrichment set selected_asset_id = ?, retry_id = null,
         media_commit_state = 'idle', text_commit_state = 'idle', voice_commit_state = 'idle',
         reaction_commit_state = 'idle', canonical_moment_id = null,
         canonical_voice_note_id = null, canonical_voice_object_id = null,
         parent_interacted = 1, updated_at = ?
       where session_id = ? and position = ? and family_id = ? and user_id = ?`,
      [assetId, stamp, sessionId, position, familyId, userId],
    );
  });
  return readTonightSession({ familyId, userId });
}

export function beginTonightKeep({ sessionId, familyId, userId, position }) {
  assertScope(familyId, userId);
  const database = getMediaDatabase();
  const item = scopedItem(database, { sessionId, familyId, userId, position });
  if (!item) throw new Error('Tonight memory is no longer available');
  if (item.item_state === 'kept') return { alreadyComplete: true, item: mapSessionItem(item) };
  const stamp = new Date().toISOString();
  database.withTransactionSync(() => {
    ensureEnrichmentRow(database, { sessionId, familyId, userId, position, stamp });
    const enrichment = scopedEnrichment(database, { sessionId, familyId, userId, position });
    const hasVoice = Boolean(enrichment?.draft_voice_uri);
    database.runSync(
      `update nightly_review_enrichment set retry_id = coalesce(retry_id, ?),
         canonical_voice_note_id = case when ? then coalesce(canonical_voice_note_id, ?) else null end,
         canonical_voice_object_id = case when ? then coalesce(canonical_voice_object_id, ?) else null end,
         temp_cleanup_state = case when ? then 'pending' else temp_cleanup_state end,
         parent_interacted = 1,
         updated_at = ?
       where session_id = ? and position = ? and family_id = ? and user_id = ?`,
      [uuid(), hasVoice ? 1 : 0, uuid(), hasVoice ? 1 : 0, uuid(), hasVoice ? 1 : 0,
        stamp, sessionId, position, familyId, userId],
    );
    database.runSync(
      `update nightly_review_items set commit_state = 'saving', last_error_code = null, updated_at = ?
       where session_id = ? and position = ? and item_state in ('queued', 'shown')`,
      [stamp, sessionId, position],
    );
  });
  return {
    alreadyComplete: false,
    item: readTonightItem({ sessionId, familyId, userId, position }),
  };
}

export function markTonightCommitStep({
  sessionId,
  familyId,
  userId,
  position,
  step,
  state,
  canonicalMomentId = undefined,
}) {
  assertScope(familyId, userId);
  if (!TONIGHT_COMMIT_STEPS.includes(step)) throw new Error('Unknown Tonight commit step');
  if (!TONIGHT_COMMIT_STEP_STATES.includes(state)) throw new Error('Unknown Tonight commit state');
  const column = `${step}_commit_state`;
  const database = getMediaDatabase();
  const stamp = new Date().toISOString();
  ensureEnrichmentRow(database, { sessionId, familyId, userId, position, stamp });
  if (canonicalMomentId !== undefined) {
    database.runSync(
      `update nightly_review_enrichment set ${column} = ?, canonical_moment_id = ?, updated_at = ?
       where session_id = ? and position = ? and family_id = ? and user_id = ?`,
      [state, canonicalMomentId || null, stamp, sessionId, position, familyId, userId],
    );
  } else {
    database.runSync(
      `update nightly_review_enrichment set ${column} = ?, updated_at = ?
       where session_id = ? and position = ? and family_id = ? and user_id = ?`,
      [state, stamp, sessionId, position, familyId, userId],
    );
  }
  return readTonightItem({ sessionId, familyId, userId, position });
}

export function completeTonightTempCleanup({ sessionId, familyId, userId, position, success = true }) {
  assertScope(familyId, userId);
  getMediaDatabase().runSync(
    `update nightly_review_enrichment set draft_voice_uri = null,
       draft_voice_duration_sec = null, draft_voice_mime_type = null,
       draft_voice_waveform_json = null, temp_cleanup_state = ?, updated_at = ?
     where session_id = ? and position = ? and family_id = ? and user_id = ?`,
    [success ? 'done' : 'failed', new Date().toISOString(), sessionId, position, familyId, userId],
  );
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

export function skipTonightItem({
  sessionId,
  familyId,
  userId,
  position,
  remoteAbsenceConfirmed = false,
}) {
  return finishDecision({
    sessionId,
    familyId,
    userId,
    position,
    decision: 'skipped',
    remoteAbsenceConfirmed,
  });
}

export function replaceTonightItemWithParentPick({
  sessionId,
  familyId,
  userId,
  position,
  asset,
  now = new Date(),
  remoteAbsenceConfirmed = false,
}) {
  assertScope(familyId, userId);
  const assetId = asset?.assetId || asset?.asset_id;
  if (!assetId) throw new Error('The selected photo is missing its library identifier');
  const candidate = normalizeDiscoveryCandidate({
    assetId,
    mediaType: asset.type === 'video' || asset.mediaType === 'video' ? 'video' : 'image',
    localUri: asset.uri,
    uri: asset.uri,
    creationTime: asset.creationTime || null,
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
    score: 1,
    captureQuality: 1,
    parentPinned: true,
  }, { scanKey: 'parent-picker', now });
  const database = getMediaDatabase();
  let discardedVoiceUri = null;
  database.withTransactionSync(() => {
    upsertCandidate(database, familyId, userId, candidate);
    const current = scopedItem(database, { sessionId, familyId, userId, position });
    if (!current || ['kept', 'skipped'].includes(current.item_state)) throw new Error('This Tonight card is already finished');
    if (!canAbandonTonightKeep(current)) {
      throw new Error('Finish retrying this Keep before choosing another memory');
    }
    assertTonightKeepAbandonmentConfirmed(current, remoteAbsenceConfirmed);
    discardAbandonableUpload(database, { familyId, userId, item: current });
    discardedVoiceUri = scopedEnrichment(database, {
      sessionId, familyId, userId, position,
    })?.draft_voice_uri || null;
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
    database.runSync(
      `delete from nightly_review_enrichment
       where session_id = ? and position = ? and family_id = ? and user_id = ?`,
      [sessionId, position, familyId, userId],
    );
  });
  return {
    ...hydrateSession(database, readActiveSession(database, familyId, userId)),
    discardedVoiceUri,
  };
}

function finishDecision({
  sessionId,
  familyId,
  userId,
  position,
  decision,
  remoteAbsenceConfirmed = false,
}) {
  assertScope(familyId, userId);
  const database = getMediaDatabase();
  const stamp = new Date().toISOString();
  let discardedVoiceUri = null;
  database.withTransactionSync(() => {
    const item = scopedItem(database, { sessionId, familyId, userId, position });
    if (!item) throw new Error('Tonight memory is no longer available');
    if (item.item_state === decision) return;
    if (['kept', 'skipped'].includes(item.item_state)) throw new Error('This Tonight memory already has a decision');
    if (decision === 'skipped' && !canAbandonTonightKeep(item)) {
      throw new Error('Finish retrying this Keep before skipping the memory');
    }
    if (decision === 'skipped') {
      assertTonightKeepAbandonmentConfirmed(item, remoteAbsenceConfirmed);
    }
    const enrichment = scopedEnrichment(database, { sessionId, familyId, userId, position });
    const decidedAssetId = enrichment?.selected_asset_id || item.asset_id;
    if (decision === 'skipped') discardAbandonableUpload(database, { familyId, userId, item });
    if (decidedAssetId !== item.asset_id) {
      database.runSync(
        `update discovery_candidates set lifecycle_state = 'superseded', superseded_by_asset_id = ?, decided_at = ?
         where family_id = ? and user_id = ? and asset_id = ?
           and lifecycle_state in ('queued', 'shown')`,
        [decidedAssetId, stamp, familyId, userId, item.asset_id],
      );
      database.runSync(
        `update candidate_clusters set representative_asset_id = ?, updated_at = ?
         where family_id = ? and user_id = ? and cluster_id in (
           select cluster_id from candidate_cluster_members
           where family_id = ? and user_id = ? and asset_id = ?
         )`,
        [decidedAssetId, stamp, familyId, userId, familyId, userId, item.asset_id],
      );
      database.runSync(
        `update candidate_cluster_members set is_representative = case when asset_id = ? then 1 else 0 end,
           updated_at = ? where family_id = ? and user_id = ? and cluster_id in (
             select cluster_id from candidate_cluster_members
             where family_id = ? and user_id = ? and asset_id = ?
           )`,
        [decidedAssetId, stamp, familyId, userId, familyId, userId, item.asset_id],
      );
      database.runSync(
        `update discovery_candidates set representative_asset_id = ?
         where family_id = ? and user_id = ? and event_cluster_key in (
           select event_cluster_key from discovery_candidates
           where family_id = ? and user_id = ? and asset_id = ?
         )`,
        [decidedAssetId, familyId, userId, familyId, userId, item.asset_id],
      );
    }
    discardedVoiceUri = decision === 'skipped' ? enrichment?.draft_voice_uri || null : null;
    database.runSync(
      `update nightly_review_items set item_state = ?, commit_state = 'done', draft_text = null,
         decided_at = ?, updated_at = ?
       where session_id = ? and position = ?`,
      [decision, stamp, stamp, sessionId, position],
    );
    updateCandidateDecision(database, { familyId, userId, assetId: decidedAssetId, state: decision, stamp });
    if (decision === 'skipped') {
      database.runSync(
        `delete from nightly_review_enrichment
         where session_id = ? and position = ? and family_id = ? and user_id = ?`,
        [sessionId, position, familyId, userId],
      );
    }
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
  const result = active ? hydrateSession(database, active) : { completed: true, items: [] };
  return { ...result, discardedVoiceUri };
}

function listEligibleCandidates(database, familyId, userId) {
  const rows = database.getAllSync(
    `with scoped as (
       select c.*, not exists (
         select 1 from family_saved_day_facts f
         where f.family_id = c.family_id and f.local_day = c.local_day
       ) and not exists (
         select 1 from media_items m
         where m.family_id = c.family_id and m.moment_id is not null
           and substr(m.creation_time, 1, 10) = c.local_day
       ) as coverage_needed
       from discovery_candidates c
       where c.family_id = ? and c.user_id = ? and c.lifecycle_state = 'eligible' and c.availability = 'available'
         and (c.representative_asset_id is null or c.representative_asset_id = c.asset_id)
         and (
           c.selection_reason_code = 'parent_pick'
           or (
             c.identity_score >= ? and c.face_size_ratio >= ? and c.sharpness >= ? and (
               (c.media_type = 'image' and c.capture_quality >= ?)
               or (c.media_type = 'video' and c.duration_sec >= 2 and c.capture_quality >= ?
                 and c.video_presence_ratio >= 0.66)
             )
           )
         )
     ), ranked as (
       select *, row_number() over (
         partition by local_day order by capture_quality desc, identity_score desc, capture_time_ms desc, asset_id asc
       ) as day_rank,
       row_number() over (
         partition by local_day, media_type order by capture_quality desc, identity_score desc,
           video_presence_ratio desc, capture_time_ms desc, asset_id asc
       ) as media_day_rank
       from scoped
     )
     select * from ranked
     where day_rank = 1 or (day_rank = 2 and capture_quality >= ?) or (media_type = 'video' and media_day_rank <= 2)
     order by coverage_needed desc, day_rank asc, capture_quality desc, identity_score desc,
       capture_time_ms desc, asset_id asc limit ?`,
    [familyId, userId, NIGHTLY_QUEUE_IDENTITY_FLOOR, NIGHTLY_QUEUE_FACE_SIZE_RATIO_FLOOR,
      NIGHTLY_QUEUE_SHARPNESS_FLOOR, NIGHTLY_QUEUE_QUALITY_FLOOR, NIGHTLY_QUEUE_QUALITY_FLOOR,
      NIGHTLY_BURST_ALTERNATE_MIN_QUALITY, NIGHTLY_CANDIDATE_QUERY_LIMIT],
  );
  return rows.map(mapCandidateRow);
}

function candidateBacklogStats(database, familyId, userId) {
  const row = database.getFirstSync(
    `select count(*) as eligible_count,
      count(distinct case when not exists (
         select 1 from family_saved_day_facts f
         where f.family_id = c.family_id and f.local_day = c.local_day
       ) and not exists (
         select 1 from media_items m
         where m.family_id = c.family_id and m.moment_id is not null
           and substr(m.creation_time, 1, 10) = c.local_day
       ) then c.local_day end) as uncovered_day_count
     from discovery_candidates c
     where c.family_id = ? and c.user_id = ? and c.lifecycle_state = 'eligible'
       and c.availability = 'available'
       and (c.representative_asset_id is null or c.representative_asset_id = c.asset_id)
       and (
         c.selection_reason_code = 'parent_pick'
         or (
           c.identity_score >= ? and c.face_size_ratio >= ? and c.sharpness >= ? and (
             (c.media_type = 'image' and c.capture_quality >= ?)
             or (c.media_type = 'video' and c.duration_sec >= 2 and c.capture_quality >= ?
               and c.video_presence_ratio >= 0.66)
           )
         )
       )`,
    [familyId, userId, NIGHTLY_QUEUE_IDENTITY_FLOOR, NIGHTLY_QUEUE_FACE_SIZE_RATIO_FLOOR,
      NIGHTLY_QUEUE_SHARPNESS_FLOOR, NIGHTLY_QUEUE_QUALITY_FLOOR, NIGHTLY_QUEUE_QUALITY_FLOOR],
  );
  return {
    eligibleCount: Number(row?.eligible_count || 0),
    uncoveredDayCount: Number(row?.uncovered_day_count || 0),
  };
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
    `select i.*, i.asset_id as queue_asset_id,
       coalesce(e.selected_asset_id, i.asset_id) as effective_asset_id,
       coalesce(sc.media_type, c.media_type) as media_type,
       coalesce(sc.local_uri, c.local_uri) as local_uri,
       coalesce(sc.preview_uri, c.preview_uri) as preview_uri,
       coalesce(sc.availability, c.availability) as availability,
       coalesce(sc.capture_time_ms, c.capture_time_ms) as capture_time_ms,
       coalesce(sc.local_day, c.local_day) as local_day,
       coalesce(sc.duration_sec, c.duration_sec) as duration_sec,
       coalesce(sc.width, c.width) as width,
       coalesce(sc.height, c.height) as height,
       coalesce(sc.identity_score, c.identity_score) as identity_score,
       coalesce(sc.capture_quality, c.capture_quality) as capture_quality,
       coalesce(sc.video_presence_ratio, c.video_presence_ratio) as video_presence_ratio,
       coalesce(sc.unavailable_reason, c.unavailable_reason) as unavailable_reason,
       coalesce(sc.source_recovery_required, c.source_recovery_required) as source_recovery_required,
       c.event_cluster_key, c.cluster_member_count,
       e.draft_voice_uri, e.draft_voice_duration_sec, e.draft_voice_mime_type,
       e.draft_voice_waveform_json, e.draft_favorite, e.draft_reaction_code,
       e.retry_id, e.canonical_moment_id, e.canonical_voice_note_id,
       e.canonical_voice_object_id, e.media_commit_state, e.text_commit_state,
       e.voice_commit_state, e.reaction_commit_state, e.draft_collection_keys_json,
       e.collection_commit_state, e.temp_cleanup_state, e.parent_interacted,
       coalesce(lm.canonical_side_effect_started, 0) as canonical_side_effect_started
     from nightly_review_items i
     join discovery_candidates c on c.family_id = i.family_id and c.user_id = i.user_id and c.asset_id = i.asset_id
     left join nightly_review_enrichment e on e.session_id = i.session_id and e.position = i.position
     left join discovery_candidates sc on sc.family_id = i.family_id and sc.user_id = i.user_id
       and sc.asset_id = e.selected_asset_id
     left join local_asset_mappings lm on lm.family_id = i.family_id and lm.owner_user_id = i.user_id
       and lm.asset_id = coalesce(e.selected_asset_id, i.asset_id)
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
    continuation: isNightlySessionContinuation(session),
    createdAt: session.created_at,
    completedAt: session.completed_at || null,
    items: rows.map(mapSessionItem),
  };
}

function scopedItem(database, { sessionId, familyId, userId, position }) {
  return database.getFirstSync(
    `select i.*, s.item_count, e.selected_asset_id, e.canonical_moment_id,
       coalesce(lm.canonical_side_effect_started, 0) as canonical_side_effect_started
     from nightly_review_items i
     join nightly_review_sessions s on s.session_id = i.session_id
     left join nightly_review_enrichment e on e.session_id = i.session_id and e.position = i.position
     left join local_asset_mappings lm on lm.family_id = i.family_id and lm.owner_user_id = i.user_id
       and lm.asset_id = coalesce(e.selected_asset_id, i.asset_id)
     where i.session_id = ? and i.position = ? and i.family_id = ? and i.user_id = ?`,
    [sessionId, position, familyId, userId],
  );
}

function scopedEnrichment(database, { sessionId, familyId, userId, position }) {
  return database.getFirstSync(
    `select * from nightly_review_enrichment
     where session_id = ? and position = ? and family_id = ? and user_id = ?`,
    [sessionId, position, familyId, userId],
  );
}

function ensureEnrichmentRow(database, { sessionId, familyId, userId, position, stamp = new Date().toISOString() }) {
  database.runSync(
    `insert into nightly_review_enrichment (
       session_id, position, family_id, user_id, updated_at
     ) values (?, ?, ?, ?, ?)
     on conflict(session_id, position) do nothing`,
    [sessionId, position, familyId, userId, stamp],
  );
}

function assertMutableItem(database, scope) {
  const item = scopedItem(database, scope);
  if (!item) throw new Error('Tonight memory is no longer available');
  if (['kept', 'skipped'].includes(item.item_state)) throw new Error('This Tonight memory is already finished');
  if (!canAbandonTonightKeep(item)) {
    throw new Error('Finish retrying this Keep before changing its context');
  }
  return item;
}

function discardAbandonableUpload(database, { familyId, userId, item }) {
  if (!canAbandonTonightKeep(item)) return;
  if (!['saving', 'failed'].includes(item.commit_state) || item.last_error_code !== 'asset_unavailable') return;
  const assetId = item.selected_asset_id || item.asset_id;
  if (!assetId) return;
  database.runSync(
    'delete from upload_jobs where family_id = ? and local_asset_id = ?',
    [familyId, assetId],
  );
  database.runSync(
    `delete from local_asset_mappings
     where family_id = ? and owner_user_id = ? and asset_id = ?
       and canonical_side_effect_started = 0`,
    [familyId, userId, assetId],
  );
}

function readTonightItem({ sessionId, familyId, userId, position }) {
  const session = readTonightSession({ familyId, userId });
  return session?.items?.find((item) => item.sessionId === sessionId && item.position === position) || null;
}

function mapSessionItem(row) {
  const withdrawnByQuality = row.item_state === 'skipped'
    && row.last_error_code === 'quality_revalidated';
  return {
    sessionId: row.session_id,
    position: Number(row.position || 0),
    assetId: row.effective_asset_id || row.selected_asset_id || row.asset_id,
    queueAssetId: row.queue_asset_id || row.asset_id,
    reasonCode: row.reason_code,
    state: withdrawnByQuality ? 'withdrawn' : row.item_state,
    commitState: row.commit_state,
    draftText: row.draft_text || '',
    draftVoice: row.draft_voice_uri ? {
      uri: row.draft_voice_uri,
      durationSec: Number(row.draft_voice_duration_sec || 0) || null,
      mimeType: row.draft_voice_mime_type || 'audio/mp4',
      waveform: parseJsonArray(row.draft_voice_waveform_json),
    } : null,
    favorite: Number(row.draft_favorite || 0) === 1,
    reactionCode: row.draft_reaction_code || null,
    collectionKeys: row.draft_collection_keys_json == null ? null : parseJsonArray(row.draft_collection_keys_json),
    parentInteracted: Number(row.parent_interacted || 0) === 1,
    retryId: row.retry_id || null,
    canonicalMomentId: row.canonical_moment_id || null,
    canonicalSideEffectStarted: Number(row.canonical_side_effect_started || 0) === 1,
    canonicalVoiceNoteId: row.canonical_voice_note_id || null,
    canonicalVoiceObjectId: row.canonical_voice_object_id || null,
    commitSteps: {
      media: row.media_commit_state || 'idle',
      text: row.text_commit_state || 'idle',
      voice: row.voice_commit_state || 'idle',
      reaction: row.reaction_commit_state || 'idle',
      collection: row.collection_commit_state || 'idle',
    },
    tempCleanupState: row.temp_cleanup_state || 'idle',
    lastErrorCode: row.last_error_code || null,
    mediaType: row.media_type || 'image',
    localUri: row.media_type === 'video'
      ? (Number(row.source_recovery_required || 0) === 1 ? null : row.local_uri || null)
      : row.local_uri || row.preview_uri || null,
    previewUri: row.preview_uri || row.local_uri || null,
    availability: row.availability || 'available',
    captureTimeMs: Number(row.capture_time_ms || 0) || null,
    localDay: row.local_day || null,
    durationSec: Number(row.duration_sec || 0) || null,
    width: Number(row.width || 0) || null,
    height: Number(row.height || 0) || null,
    unavailableReason: row.unavailable_reason || null,
    sourceRecoveryRequired: Number(row.source_recovery_required || 0) === 1,
  };
}

function revalidateActiveNightlySession(database, session, now = new Date()) {
  if (!session?.session_id || session.status !== 'active') return 0;
  const rows = database.getAllSync(
    `select i.position, i.asset_id, i.reason_code, i.item_state, i.commit_state, i.draft_text,
       c.media_type, c.availability, c.identity_score, c.capture_quality,
       c.face_size_ratio, c.sharpness,
       c.duration_sec, c.video_presence_ratio,
       e.parent_interacted, e.media_commit_state, e.text_commit_state,
       e.voice_commit_state, e.reaction_commit_state, e.collection_commit_state
     from nightly_review_items i
     join discovery_candidates c on c.family_id = i.family_id and c.user_id = i.user_id
       and c.asset_id = i.asset_id
     left join nightly_review_enrichment e on e.session_id = i.session_id and e.position = i.position
     where i.session_id = ? and i.item_state in ('queued', 'shown')`,
    [session.session_id],
  );
  const withdrawn = rows.filter((row) => shouldWithdrawStaleNightlyItem({
    reasonCode: row.reason_code,
    commitState: row.commit_state,
    draftText: row.draft_text,
    parentInteracted: Number(row.parent_interacted || 0) === 1,
    enrichmentStates: [
      row.media_commit_state,
      row.text_commit_state,
      row.voice_commit_state,
      row.reaction_commit_state,
      row.collection_commit_state,
    ],
    availability: row.availability,
    identityScore: row.identity_score,
    captureQuality: row.capture_quality,
    faceSizeRatio: row.face_size_ratio,
    sharpness: row.sharpness,
    mediaType: row.media_type,
    durationSec: row.duration_sec,
    videoPresenceRatio: row.video_presence_ratio,
  }));
  if (!withdrawn.length) return 0;

  const stamp = now.toISOString();
  database.withTransactionSync(() => {
    for (const row of withdrawn) {
      database.runSync(
        `update nightly_review_items set item_state = 'skipped', commit_state = 'done',
           last_error_code = 'quality_revalidated', decided_at = ?, updated_at = ?
         where session_id = ? and position = ? and item_state in ('queued', 'shown')`,
        [stamp, stamp, session.session_id, row.position],
      );
      database.runSync(
        `update discovery_candidates set lifecycle_state = 'rejected', decided_at = ?
         where family_id = ? and user_id = ? and asset_id = ?
           and lifecycle_state in ('eligible', 'queued', 'shown')`,
        [stamp, session.family_id, session.user_id, row.asset_id],
      );
    }
    const next = database.getFirstSync(
      `select min(position) as position, count(*) as count
       from nightly_review_items
       where session_id = ? and item_state in ('queued', 'shown', 'unavailable')`,
      [session.session_id],
    );
    const completed = Number(next?.count || 0) === 0;
    database.runSync(
      `update nightly_review_sessions set current_position = ?, status = ?, completed_at = ?, updated_at = ?
       where session_id = ? and status = 'active'`,
      [completed ? Number(session.item_count || 0) : Number(next?.position || 0),
        completed ? 'completed' : 'active', completed ? stamp : null, stamp, session.session_id],
    );
  });
  return withdrawn.length;
}

function sessionHasQualityWithdrawals(database, sessionId) {
  if (!sessionId) return false;
  return Number(database.getFirstSync(
    `select count(*) as count from nightly_review_items
     where session_id = ? and last_error_code = 'quality_revalidated'`,
    [sessionId],
  )?.count || 0) > 0;
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
    faceSizeRatio: finiteOrNull(row.face_size_ratio),
    sharpness: finiteOrNull(row.sharpness),
    videoPresenceRatio: Number(row.video_presence_ratio || 0),
    visualFingerprint: parseJsonArray(row.visual_fingerprint_json),
    eventClusterKey: row.event_cluster_key,
    clusterMemberCount: Number(row.cluster_member_count || 1),
    coverageNeeded: Number(row.coverage_needed || 0) === 1,
    dayRank: Number(row.day_rank || 0) || null,
    lifecycleState: row.lifecycle_state,
    selectionReasonCode: row.selection_reason_code,
  };
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function upsertCandidate(database, familyId, userId, candidate) {
  database.runSync(
    `insert into discovery_candidates (
       family_id, user_id, asset_id, media_type, local_uri, preview_uri, availability,
       capture_time_ms, local_day, capture_timezone, width, height, duration_sec, identity_score, identity_band,
       face_count, capture_quality, face_size_ratio, sharpness, smile_score, video_presence_ratio,
       video_sampled_frames, video_matched_frames, visual_fingerprint_json, identity_evidence_json,
       event_cluster_key, representative_asset_id, cluster_member_count, scorer_version,
       selection_reason_code, lifecycle_state, scan_key, first_seen_at, last_analyzed_at, unavailable_reason,
       last_seen_scan_key, last_seen_at, unavailable_code, source_recovery_required
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(family_id, user_id, asset_id) do update set
       media_type = excluded.media_type, local_uri = coalesce(excluded.local_uri, discovery_candidates.local_uri),
       preview_uri = coalesce(excluded.preview_uri, discovery_candidates.preview_uri), availability = excluded.availability,
       capture_time_ms = coalesce(excluded.capture_time_ms, discovery_candidates.capture_time_ms),
       local_day = coalesce(discovery_candidates.local_day, excluded.local_day),
       capture_timezone = coalesce(discovery_candidates.capture_timezone, excluded.capture_timezone),
       width = coalesce(excluded.width, discovery_candidates.width),
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
       lifecycle_state = ${PRESERVE_CANDIDATE_LIFECYCLE_ON_ANALYSIS_SQL},
       scan_key = excluded.scan_key, last_analyzed_at = excluded.last_analyzed_at,
       last_seen_scan_key = excluded.last_seen_scan_key, last_seen_at = excluded.last_seen_at,
       unavailable_reason = excluded.unavailable_reason, unavailable_code = excluded.unavailable_code,
       source_recovery_required = case
         when excluded.media_type = 'video' and excluded.local_uri is not null
           and (excluded.preview_uri is null or excluded.local_uri <> excluded.preview_uri) then 0
         else discovery_candidates.source_recovery_required
       end`,
    [familyId, userId, candidate.assetId, candidate.mediaType, candidate.localUri, candidate.previewUri,
      candidate.availability, candidate.captureTimeMs, candidate.localDay, candidate.captureTimezone,
      candidate.width, candidate.height,
      candidate.durationSec, candidate.identityScore, candidate.identityBand, candidate.faceCount,
      candidate.captureQuality, candidate.faceSizeRatio, candidate.sharpness, candidate.smileScore,
      candidate.videoPresenceRatio, candidate.videoSampledFrames, candidate.videoMatchedFrames,
      candidate.visualFingerprintJson, candidate.identityEvidenceJson, candidate.eventClusterKey,
      candidate.representativeAssetId, candidate.clusterMemberCount, candidate.scorerVersion,
      candidate.selectionReasonCode, candidate.lifecycleState, candidate.scanKey, candidate.firstSeenAt,
      candidate.lastAnalyzedAt, candidate.unavailableReason, candidate.lastSeenScanKey,
      candidate.lastSeenAt, candidate.unavailableCode || null, 0],
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

function promoteUnavailableClusterRepresentatives(database, { familyId, userId, stamp }) {
  const clusters = database.getAllSync(
    `select cc.cluster_id
     from candidate_clusters cc
     join discovery_candidates representative
       on representative.family_id = cc.family_id and representative.user_id = cc.user_id
       and representative.asset_id = cc.representative_asset_id
     where cc.family_id = ? and cc.user_id = ? and representative.availability <> 'available'
       and not exists (
         select 1 from nightly_review_items i
         join nightly_review_sessions s on s.session_id = i.session_id and s.status = 'active'
         where i.family_id = cc.family_id and i.user_id = cc.user_id
           and i.item_state in ('queued', 'shown', 'unavailable')
           and i.asset_id = cc.representative_asset_id
       )`,
    [familyId, userId],
  );
  for (const cluster of clusters) {
    const next = database.getFirstSync(
      `select c.asset_id
       from candidate_cluster_members m
       join discovery_candidates c on c.family_id = m.family_id and c.user_id = m.user_id
         and c.asset_id = m.asset_id
       where m.family_id = ? and m.user_id = ? and m.cluster_id = ?
         and c.availability = 'available' and c.identity_band = 'clear'
         and c.lifecycle_state in ('eligible', 'discovered', 'superseded')
         and c.capture_quality >= ?
       order by c.capture_quality desc, c.identity_score desc, c.capture_time_ms desc, c.asset_id asc
       limit 1`,
      [familyId, userId, cluster.cluster_id, NIGHTLY_BURST_ALTERNATE_MIN_QUALITY],
    );
    if (!next?.asset_id) continue;
    database.runSync(
      `update candidate_clusters set representative_asset_id = ?, updated_at = ?
       where family_id = ? and user_id = ? and cluster_id = ?`,
      [next.asset_id, stamp, familyId, userId, cluster.cluster_id],
    );
    database.runSync(
      `update candidate_cluster_members set is_representative = case when asset_id = ? then 1 else 0 end,
         updated_at = ? where family_id = ? and user_id = ? and cluster_id = ?`,
      [next.asset_id, stamp, familyId, userId, cluster.cluster_id],
    );
    database.runSync(
      `update discovery_candidates set representative_asset_id = ?,
         lifecycle_state = case
           when asset_id = ? and lifecycle_state in ('discovered', 'superseded') then 'eligible'
           when asset_id <> ? and lifecycle_state in ('discovered', 'eligible', 'superseded') then 'superseded'
           else lifecycle_state
         end,
         superseded_by_asset_id = case
           when asset_id = ? then null
           when lifecycle_state in ('discovered', 'eligible', 'superseded') then ?
           else superseded_by_asset_id
         end
       where family_id = ? and user_id = ? and asset_id in (
         select asset_id from candidate_cluster_members
         where family_id = ? and user_id = ? and cluster_id = ?
       )`,
      [next.asset_id, next.asset_id, next.asset_id, next.asset_id, next.asset_id,
        familyId, userId, familyId, userId, cluster.cluster_id],
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

function resolvedTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `tonight-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

class ActiveSessionRaceError extends Error {}

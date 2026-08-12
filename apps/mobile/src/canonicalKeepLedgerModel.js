import { CANDIDATE_SCORER_VERSION } from './candidateLedgerModel.js';

/**
 * SQLite reconciliation core kept native-module-free so the exact SQL contract
 * can be exercised in deterministic Node tests.
 */
export function reconcileCanonicalKeepInDatabase({
  database,
  familyId,
  userId,
  assetId,
  mediaType = 'image',
  activeTonightItem = null,
  now = new Date(),
}) {
  if (!database || !familyId || !userId || !assetId) {
    throw new Error('A database, family, parent, and kept asset are required');
  }
  const stamp = now.toISOString();
  const preservedSessionId = activeTonightItem?.sessionId || null;
  const preservedPosition = Number.isInteger(activeTonightItem?.position)
    ? activeTonightItem.position
    : -1;
  let retiredItems = 0;
  let completedSessions = 0;

  database.withTransactionSync(() => {
    database.runSync(
      `insert into discovery_candidates (
         family_id, user_id, asset_id, media_type, availability, scorer_version,
         lifecycle_state, scan_key, first_seen_at, last_analyzed_at, decided_at
       ) values (?, ?, ?, ?, 'available', ?, 'kept', null, ?, ?, ?)
       on conflict(family_id, user_id, asset_id) do update set
         lifecycle_state = 'kept', decided_at = excluded.decided_at`,
      [familyId, userId, assetId, mediaType === 'video' ? 'video' : 'image',
        CANDIDATE_SCORER_VERSION, stamp, stamp, stamp],
    );

    const matchingItems = database.getAllSync(
      `select i.session_id, i.position
       from nightly_review_items i
       join nightly_review_sessions s on s.session_id = i.session_id
       left join nightly_review_enrichment e
         on e.session_id = i.session_id and e.position = i.position
       where i.family_id = ? and i.user_id = ? and s.status = 'active'
         and i.item_state in ('queued', 'shown', 'unavailable')
         and coalesce(e.selected_asset_id, i.asset_id) = ?
         and not (? is not null and i.session_id = ? and i.position = ?)`,
      [familyId, userId, assetId, preservedSessionId, preservedSessionId, preservedPosition],
    );
    const affectedSessions = [...new Set(matchingItems.map((row) => row.session_id))];
    for (const item of matchingItems) {
      database.runSync(
        `update nightly_review_items set item_state = 'kept', commit_state = 'done',
           draft_text = null, last_error_code = null, decided_at = ?, updated_at = ?
         where session_id = ? and position = ? and family_id = ? and user_id = ?
           and item_state in ('queued', 'shown', 'unavailable')`,
        [stamp, stamp, item.session_id, item.position, familyId, userId],
      );
    }
    retiredItems = matchingItems.length;

    for (const sessionId of affectedSessions) {
      const remaining = database.getFirstSync(
        `select min(i.position) as position, count(i.position) as count, max(s.item_count) as item_count
         from nightly_review_sessions s
         left join nightly_review_items i on i.session_id = s.session_id
           and i.item_state in ('queued', 'shown', 'unavailable')
         where s.session_id = ? and s.family_id = ? and s.user_id = ?`,
        [sessionId, familyId, userId],
      );
      const completed = Number(remaining?.count || 0) === 0;
      database.runSync(
        `update nightly_review_sessions set current_position = ?, status = ?,
           completed_at = ?, updated_at = ?
         where session_id = ? and family_id = ? and user_id = ? and status = 'active'`,
        [completed ? Number(remaining?.item_count || 0) : Number(remaining?.position || 0),
          completed ? 'completed' : 'active', completed ? stamp : null, stamp,
          sessionId, familyId, userId],
      );
      if (completed) completedSessions += 1;
    }
  });

  return { retiredItems, completedSessions };
}

import { bucketCount } from './analyticsEventsModel.js';

export function tonightOpenProperties(session, { openSource = 'direct' } = {}) {
  const items = session?.items || [];
  const decided = items.filter((item) => ['kept', 'skipped'].includes(item?.state)).length;
  return {
    surface: 'tonight',
    open_source: ['today', 'notification', 'direct'].includes(openSource) ? openSource : 'unknown',
    queue_count_bucket: bucketCount(items.length),
    resume_state: !session
      ? 'empty'
      : session.completed
        ? 'completed'
        : decided > 0 || Number(session.currentPosition || 0) > 0
          ? 'resumed'
          : 'new',
  };
}

export function tonightDecisionProperties(item, decision, { retried = false } = {}) {
  const cleanDecision = ['kept', 'skipped', 'unavailable'].includes(decision) ? decision : 'unavailable';
  return {
    surface: 'tonight',
    decision: cleanDecision,
    media_kind: item?.mediaType === 'video' ? 'video' : 'photo',
    has_enrichment: Boolean(
      String(item?.draftText || '').trim()
      || item?.draftVoice?.uri
      || item?.favorite
      || item?.reactionCode,
    ),
    retry_state: retried ? 'retry' : 'first_try',
  };
}

export function tonightCompletionProperties(session, { completedAt = new Date() } = {}) {
  const items = session?.items || [];
  const kept = items.filter((item) => item?.state === 'kept');
  const skipped = items.filter((item) => item?.state === 'skipped');
  const unavailable = items.filter((item) => item?.state === 'unavailable');
  const enriched = kept.filter((item) => (
    String(item?.draftText || '').trim()
    || item?.draftVoice?.uri
    || item?.favorite
    || item?.reactionCode
    || item?.textCommitState === 'saved'
    || item?.voiceCommitState === 'saved'
    || item?.reactionCommitState === 'saved'
  ));
  return {
    surface: 'tonight',
    kept_count_bucket: bucketCount(kept.length),
    skipped_count_bucket: bucketCount(skipped.length),
    unavailable_count_bucket: bucketCount(unavailable.length),
    enriched_count_bucket: bucketCount(enriched.length),
    duration_bucket: durationBucket(session?.createdAt, completedAt),
    continuation: Boolean(session?.continuation),
  };
}

export function durationBucket(startedAt, endedAt) {
  const start = new Date(startedAt);
  const end = endedAt instanceof Date ? endedAt : new Date(endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 'unknown';
  const seconds = (end.getTime() - start.getTime()) / 1000;
  if (seconds < 60) return 'under_1m';
  if (seconds < 180) return '1_3m';
  if (seconds < 300) return '3_5m';
  if (seconds < 600) return '5_10m';
  return '10m_plus';
}

// Pure readiness scoring for gentle book nudges. This is deliberately stricter
// than archive worthiness: a book-ready moment/month needs media plus durable
// parent context.

export const MOMENT_READINESS_MEDIA_MIN = 1;
export const MONTH_READINESS_MEDIA_MIN = 3;

const DURABLE_CONTEXT_KINDS = new Set(['title', 'note', 'voice', 'first', 'prompt', 'letter']);

export function scoreMomentBookReadiness(record = {}, { contextItems = [] } = {}) {
  const source = sourceForRecord(record);
  const mediaCount = mediaCountForRecord(record, source);
  const matchedContext = contextForRecord(record, contextItems);
  const durableContextKinds = durableContextKindsForRecord(record, source, matchedContext);
  const durableContextCount = durableContextKinds.length;
  const hasEnoughMedia = mediaCount >= MOMENT_READINESS_MEDIA_MIN;
  const hasDurableContext = durableContextCount > 0;
  const bookReady = hasEnoughMedia && hasDurableContext;
  const state = bookReady
    ? 'ready'
    : hasEnoughMedia
      ? 'needs_context'
      : hasDurableContext
        ? 'needs_media'
        : 'empty';

  return {
    state,
    bookReady,
    score: scoreReadiness({
      mediaCount,
      mediaMin: MOMENT_READINESS_MEDIA_MIN,
      durableContextCount,
      maxMediaPoints: 55,
    }),
    hasEnoughMedia,
    hasDurableContext,
    mediaCount,
    durableContextCount,
    durableContextKinds,
  };
}

export function scoreMonthBookReadiness(chapter = {}) {
  const contextItems = chapter?.contextItems || [];
  const records = chapter?.records || [];
  const momentScores = records.map((record) => scoreMomentBookReadiness(record, { contextItems }));
  const explicitMediaCount = Number(chapter?.photos || 0) + Number(chapter?.videos || 0);
  const mediaCount = Math.max(
    explicitMediaCount,
    momentScores.reduce((sum, score) => sum + score.mediaCount, 0),
  );
  const durableContextCount = contextItems.length
    + momentScores.reduce((sum, score) => sum + score.durableContextCount, 0);
  const hasEnoughMedia = mediaCount >= MONTH_READINESS_MEDIA_MIN;
  const hasDurableContext = durableContextCount > 0;
  const bookReady = hasEnoughMedia && hasDurableContext;
  const state = bookReady
    ? 'ready'
    : hasEnoughMedia
      ? 'needs_context'
      : mediaCount > 0
        ? 'collecting'
        : hasDurableContext
          ? 'needs_media'
          : 'empty';

  return {
    state,
    bookReady,
    score: scoreReadiness({
      mediaCount,
      mediaMin: MONTH_READINESS_MEDIA_MIN,
      durableContextCount,
      maxMediaPoints: 55,
    }),
    hasEnoughMedia,
    hasDurableContext,
    mediaCount,
    durableContextCount,
    readyMomentCount: momentScores.filter((score) => score.bookReady).length,
    momentScores,
  };
}

export function selectBookReadinessNudge({ records = [], chapters = [] } = {}) {
  const chapterCandidate = (chapters || [])
    .map((chapter) => ({ chapter, readiness: scoreMonthBookReadiness(chapter) }))
    .find((candidate) => candidate.readiness.state === 'needs_context');

  if (chapterCandidate) {
    const record = latestNeedsContextRecord(chapterCandidate.chapter.records, chapterCandidate.chapter.contextItems);
    return {
      eyebrow: 'Remember',
      title: `Add one line to make ${shortChapterTitle(chapterCandidate.chapter.title)} easier to remember`,
      route: routeForRecord(record) || { pathname: '/library', params: { segment: 'photos' } },
      state: 'needs_context',
      mediaCount: chapterCandidate.readiness.mediaCount,
    };
  }

  if (!chapters?.length) {
    const record = latestNeedsContextRecord(records, []);
    if (record) {
      return {
        eyebrow: 'Remember',
        title: 'Add one line to make this moment easier to remember',
        route: routeForRecord(record) || { pathname: '/library', params: { segment: 'photos' } },
        state: 'needs_context',
        mediaCount: scoreMomentBookReadiness(record).mediaCount,
      };
    }
  }

  return null;
}

function scoreReadiness({
  mediaCount,
  mediaMin,
  durableContextCount,
  maxMediaPoints,
}) {
  const mediaPoints = Math.min(maxMediaPoints, Math.round((Math.max(0, mediaCount) / mediaMin) * maxMediaPoints));
  const contextPoints = durableContextCount > 0 ? Math.min(45, 25 + (durableContextCount * 10)) : 0;
  return Math.min(100, mediaPoints + contextPoints);
}

function sourceForRecord(record = {}) {
  return record?.moment || record?.photo || record || {};
}

function mediaCountForRecord(record = {}, source = {}) {
  const explicitCount = Number(record?.imageCount || 0) + Number(record?.videoCount || 0);
  if (explicitCount > 0) return explicitCount;
  const media = Array.isArray(source?.media)
    ? source.media
    : Array.isArray(source?.moment_media)
      ? source.moment_media
      : [];
  if (media.length) {
    return media.filter((item) => item && !item.deleted_at).length;
  }
  if (record?.photo || source?.asset_id || source?.assetId) return 1;
  return 0;
}

function durableContextKindsForRecord(record = {}, source = {}, contextItems = []) {
  const kinds = new Set();
  if (hasText(source?.title)) kinds.add('title');
  if (hasText(source?.caption_note || source?.captionNote || source?.memory_note || source?.memoryNote)) {
    kinds.add('note');
  }
  if (voiceCountForRecord(record, source) > 0) kinds.add('voice');
  if (hasFirstLink(record, source)) kinds.add('first');

  for (const item of contextItems || []) {
    const kind = normalizeContextKind(item?.kind);
    if (kind) kinds.add(kind);
  }

  return [...kinds].filter((kind) => DURABLE_CONTEXT_KINDS.has(kind));
}

function voiceCountForRecord(record = {}, source = {}) {
  const explicit = Number(record?.voiceCount || 0);
  if (explicit > 0) return explicit;
  if (Array.isArray(source?.voiceNotes)) return source.voiceNotes.length;
  if (Array.isArray(source?.voice_notes)) return source.voice_notes.length;
  return 0;
}

function hasFirstLink(record = {}, source = {}) {
  const tags = Array.isArray(source?.tags) ? source.tags : Array.isArray(record?.tags) ? record.tags : [];
  return tags.some((tag) => {
    const value = String(tag || '').toLowerCase();
    return value === 'first' || value.startsWith('first:');
  }) || hasText(source?.first_id || source?.firstId || source?.source_first_id || source?.sourceFirstId);
}

function contextForRecord(record = {}, contextItems = []) {
  const ids = new Set([
    record?.id,
    record?.moment?.id,
    record?.moment_id,
    record?.momentId,
    record?.photo?.moment_id,
    record?.photo?.momentId,
  ].filter(Boolean).map(String));
  if (!ids.size) return [];
  return (contextItems || []).filter((item) => {
    const momentId = item?.momentId || item?.moment_id || item?.sourceMomentId || item?.source_moment_id;
    return momentId && ids.has(String(momentId));
  });
}

function latestNeedsContextRecord(records = [], contextItems = []) {
  return [...(records || [])]
    .sort((a, b) => timestampForRecord(b) - timestampForRecord(a))
    .find((record) => scoreMomentBookReadiness(record, { contextItems }).state === 'needs_context') || null;
}

function routeForRecord(record) {
  const looksLikePhoto = record?.photo || record?.asset_id || record?.assetId;
  const momentId = record?.moment?.id || record?.moment_id || record?.momentId || (looksLikePhoto ? null : record?.id);
  if (!momentId || record?.photo) return null;
  return { pathname: '/moment/[momentId]', params: { momentId } };
}

function shortChapterTitle(title) {
  const raw = String(title || '').trim();
  if (!raw || raw === 'Undated') return 'this chapter';
  return raw.replace(/\s+\d{4}$/, '');
}

function normalizeContextKind(kind) {
  const value = String(kind || '').toLowerCase();
  if (value === 'voice_note') return 'voice';
  if (DURABLE_CONTEXT_KINDS.has(value)) return value;
  return null;
}

function timestampForRecord(record = {}) {
  const value = record?.capturedAt
    || record?.captured_at
    || record?.moment?.captured_at
    || record?.moment?.created_at
    || record?.photo?.creation_time
    || record?.photo?.tagged_at;
  const ms = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function hasText(value) {
  return String(value || '').trim().length > 0;
}

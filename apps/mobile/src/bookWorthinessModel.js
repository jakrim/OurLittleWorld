export const BOOK_HIGHLIGHT_SCORE_MIN = 55;

const PARENT_KEPT_SOURCES = new Set([
  'manual-picker',
  'library-review',
  'review-batch',
  'add-sheet',
]);
const AUTO_SAVE_SOURCES = new Set(['scan-auto-save']);

export function buildBookWorthinessForMoment(moment = {}, { voiceCount = null } = {}) {
  return buildBookWorthiness({
    title: moment?.title,
    captionNote: moment?.caption_note || moment?.captionNote,
    placeName: moment?.place_name || moment?.placeName,
    tags: moment?.tags || [],
    media: moment?.media || moment?.moment_media || [],
    voiceCount: voiceCount ?? (moment?.voiceNotes || moment?.voice_notes || []).length,
    hasMoment: !!moment,
  });
}

export function buildBookWorthinessForPhoto(photo = {}) {
  return buildBookWorthiness({
    title: photo?.title,
    captionNote: photo?.caption_note || photo?.captionNote || photo?.memory_note || photo?.memoryNote,
    placeName: photo?.location_label || photo?.place_name || photo?.placeName,
    tags: photo?.tags || ['photo'],
    media: photo?.moment_media ? [photo.moment_media] : [],
    voiceCount: 0,
    hasMoment: false,
  });
}

export function buildBookWorthiness({
  title = '',
  captionNote = '',
  placeName = '',
  tags = [],
  media = [],
  voiceCount = 0,
  hasMoment = false,
} = {}) {
  const mediaItems = Array.isArray(media) ? media : [];
  const sources = mediaItems.map((item) => item?.metadata?.source).filter(Boolean);
  const autoSaved = sources.some((source) => AUTO_SAVE_SOURCES.has(source));
  const parentKept = sources.some((source) => PARENT_KEPT_SOURCES.has(source))
    || (!autoSaved && hasMoment && !sources.length);
  const quality = bestCaptureQuality(mediaItems);
  const normalizedTags = (tags || []).map((tag) => String(tag || '').toLowerCase()).filter(Boolean);
  const hasFirstLink = normalizedTags.some((tag) => tag.startsWith('first:') || tag === 'first');
  const hasWrittenContext = Boolean(
    String(title || '').trim()
    || String(captionNote || '').trim()
    || meaningfulTagCount(normalizedTags)
    || String(placeName || '').trim(),
  );
  const hasVoice = Number(voiceCount || 0) > 0;
  const hasVideo = mediaItems.some((item) => item?.media_type === 'video' || item?.mediaType === 'video');
  const reasons = [];
  let score = 20; // Saved privately in the archive.

  if (parentKept) {
    score += 35;
    reasons.push('parent-kept');
  }
  if (hasWrittenContext) {
    score += 20;
    reasons.push('context');
  }
  if (hasVoice) {
    score += 20;
    reasons.push('voice');
  }
  if (hasFirstLink) {
    score += 20;
    reasons.push('first');
  }
  if (quality >= 0.82) {
    score += 25;
    reasons.push('strong-quality');
  } else if (quality >= 0.65) {
    score += 12;
    reasons.push('usable-quality');
  }
  if (hasVideo) {
    score += 5;
    reasons.push('video');
  }
  if (autoSaved && !hasWrittenContext && !hasVoice && !hasFirstLink) {
    score -= 20;
    reasons.push('archive-only-auto-save');
  }

  const bookEligible = score >= BOOK_HIGHLIGHT_SCORE_MIN;
  return {
    savedToArchive: true,
    bookEligible,
    bookScore: score,
    archiveSource: autoSaved ? 'auto-save' : parentKept ? 'parent-kept' : 'archive',
    archiveStatusLabel: 'Saved in archive',
    bookStatusLabel: bookEligible ? 'Ready for the book' : 'Saved in archive',
    reasons,
  };
}

export function sortBookHighlightCandidates(items = [], scoreForItem = (item) => item?.bookScore || 0) {
  return [...(items || [])].sort((a, b) => {
    const scoreDelta = Number(scoreForItem(b) || 0) - Number(scoreForItem(a) || 0);
    if (scoreDelta) return scoreDelta;
    return timestampOf(b) - timestampOf(a);
  });
}

function bestCaptureQuality(media = []) {
  let best = 0;
  for (const item of media || []) {
    const quality = Number(item?.metadata?.captureQuality ?? item?.captureQuality);
    if (Number.isFinite(quality)) best = Math.max(best, quality);
  }
  return best;
}

function meaningfulTagCount(tags = []) {
  return (tags || []).filter((tag) => tag && tag !== 'photo' && tag !== 'video').length;
}

function timestampOf(item) {
  const value = item?.capturedAt || item?.captured_at || item?.createdAt || item?.created_at;
  const ms = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

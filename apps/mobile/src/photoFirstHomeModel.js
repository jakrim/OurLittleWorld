export function selectPhotoFirstHome({ tonightSession, sharedPhotos = [], membersById = {} } = {}) {
  const tonightItem = (tonightSession?.items || []).find((item) => (
    ['queued', 'shown', 'unavailable'].includes(item?.state)
  ));
  const tonightUri = imageOnlyTonightUri(tonightItem);
  if (tonightUri) {
    const remaining = (tonightSession.items || []).filter((item) => (
      ['queued', 'shown', 'unavailable'].includes(item?.state)
    )).length;
    return {
      kind: 'tonight',
      mediaUri: tonightUri,
      mediaType: tonightItem.mediaType || 'image',
      capturedAt: numberDate(tonightItem.captureTimeMs),
      momentId: null,
      author: null,
      remaining,
      reasonCode: tonightItem.reasonCode || null,
    };
  }

  const kept = (sharedPhotos || []).find((item) => imageOnlyKeptUri(item));
  if (kept) {
    return {
      kind: 'kept',
      mediaUri: imageOnlyKeptUri(kept),
      mediaType: kept.media_type || kept.mediaType || 'image',
      capturedAt: safeDate(kept.creation_time || kept.captured_at || kept.tagged_at || kept.created_at),
      momentId: kept.moment_id || kept.momentId || null,
      author: membersById[kept.asset_owner_user_id || kept.user_id || kept.author_user_id] || null,
      remaining: 0,
      reasonCode: null,
    };
  }

  return {
    kind: 'empty',
    mediaUri: null,
    mediaType: null,
    capturedAt: null,
    momentId: null,
    author: null,
    remaining: 0,
    reasonCode: null,
  };
}

function imageOnlyTonightUri(item) {
  if (!item) return null;
  if (item.mediaType === 'video') return item.previewUri || null;
  return item.localUri || item.previewUri || null;
}

function imageOnlyKeptUri(item) {
  if (!item) return null;
  const mediaType = item.media_type || item.mediaType || 'image';
  if (mediaType === 'video') return item.posterUrl || item.thumbUrl || null;
  return item.thumbUrl || item.fullUrl || item.posterUrl || null;
}

export function photoFirstHomeMediaHeight(viewportHeight) {
  const height = Number.isFinite(Number(viewportHeight)) && Number(viewportHeight) > 0
    ? Number(viewportHeight)
    : 844;
  return Math.max(360, Math.min(560, Math.round(height * 0.56)));
}

function numberDate(value) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  return new Date(Number(value));
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

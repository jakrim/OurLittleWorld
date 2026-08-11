export function selectPhotoFirstHome({ tonightSession, sharedPhotos = [], membersById = {} } = {}) {
  const tonightItem = (tonightSession?.items || []).find((item) => (
    ['queued', 'shown', 'unavailable'].includes(item?.state)
  ));
  if (tonightItem?.localUri || tonightItem?.previewUri) {
    const remaining = (tonightSession.items || []).filter((item) => (
      ['queued', 'shown', 'unavailable'].includes(item?.state)
    )).length;
    return {
      kind: 'tonight',
      mediaUri: tonightItem.localUri || tonightItem.previewUri,
      mediaType: tonightItem.mediaType || 'image',
      capturedAt: numberDate(tonightItem.captureTimeMs),
      momentId: null,
      author: null,
      remaining,
      reasonCode: tonightItem.reasonCode || null,
    };
  }

  const kept = (sharedPhotos || []).find((item) => item?.thumbUrl || item?.fullUrl);
  if (kept) {
    return {
      kind: 'kept',
      mediaUri: kept.fullUrl || kept.thumbUrl,
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

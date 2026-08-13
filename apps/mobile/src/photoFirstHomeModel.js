export function selectPhotoFirstHome({ tonightSession, sharedPhotos = [], membersById = {} } = {}) {
  const readyTonightItems = (tonightSession?.items || []).filter((item) => (
    ['queued', 'shown', 'unavailable'].includes(item?.state)
  ));
  // Today is a static, photo-led surface. Prefer an available image when the
  // queue has one: video posters live in the app cache and can become stale
  // across a source-matched reinstall even while the Photos video itself is
  // still available to Tonight. A transient poster must not become a blank
  // first viewport or hide another strong child photo already in the queue.
  const tonightItem = readyTonightItems.find((item) => (
    item?.mediaType !== 'video' && imageOnlyTonightUri(item)
  )) || readyTonightItems.find((item) => imageOnlyTonightUri(item));
  const tonightUri = imageOnlyTonightUri(tonightItem);
  if (tonightUri) {
    const remaining = readyTonightItems.length;
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

  // A Keep should update Today immediately even for legacy rows whose capture
  // time is missing. `tagged_at` may rank what the parent just kept, but it is
  // never displayed as the photo's capture date.
  const kept = [...(sharedPhotos || [])]
    .filter((item) => imageOnlyKeptUri(item))
    .sort((a, b) => keptAtMs(b) - keptAtMs(a))[0];
  if (kept) {
    return {
      kind: 'kept',
      mediaUri: imageOnlyKeptUri(kept),
      mediaType: kept.media_type || kept.mediaType || 'image',
      capturedAt: safeDate(kept.creation_time || kept.captured_at),
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

function keptAtMs(item) {
  return safeDate(item?.tagged_at || item?.created_at)?.getTime() || 0;
}

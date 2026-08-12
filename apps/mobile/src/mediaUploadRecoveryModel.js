export async function confirmMediaUploadFinalized({ reservationId, finalize, read }) {
  if (!reservationId || !finalize || !read) throw new Error('Media upload finalization context is incomplete');
  let finalizationError = null;
  try {
    await finalize(reservationId);
  } catch (error) {
    finalizationError = error;
  }

  let reservation = null;
  try {
    reservation = await read(reservationId);
  } catch (readError) {
    throw finalizationError || readError;
  }
  if (reservation?.status === 'finalized') return reservation;
  if (finalizationError) throw finalizationError;
  throw new Error('Media upload finalization was not confirmed');
}

export async function resumeCanonicalObjectUpload({
  context = null,
  complete = false,
  kind = 'image',
  reserve,
  persist,
  upload,
  finalize,
  publish,
  abandon,
}) {
  if (complete) return { kind, state: publish ? 'published' : 'finalized', reused: true };
  let current = normalizeObjectContext(context, kind);
  if (current?.state === 'published') return current;

  if (!current?.reservationId) {
    const reservationId = await reserve();
    if (!reservationId) throw new Error('Canonical media quota reservation is required');
    current = { kind, reservationId, state: 'reserved', result: null };
    try {
      await persist(current);
    } catch (error) {
      await abandon?.(reservationId).catch(() => undefined);
      throw error;
    }
  }

  if (current.state === 'reserved') {
    const result = await upload(current);
    current = { ...current, result: result ?? current.result, state: 'uploaded' };
    await persist(current);
  }
  if (current.state === 'uploaded') {
    await finalize(current);
    current = { ...current, state: 'finalized' };
    await persist(current);
  }
  if (current.state === 'finalized' && publish) {
    await publish(current);
    current = { ...current, state: 'published' };
    await persist(current);
  }
  return current;
}

export function canonicalImageKeepComplete({ existingMedia, existingTag, momentId, mediaId, fullObjectId, thumbObjectId }) {
  const recovery = canonicalImageKeepRecovery({
    existingMedia,
    existingTag,
    momentId,
    mediaId,
    fullObjectId,
    thumbObjectId,
  });
  return recovery.complete;
}

export function canonicalImageKeepRecovery({ existingMedia, existingTag, momentId, mediaId, fullObjectId, thumbObjectId }) {
  const mediaReady = existingMedia?.media_type === 'image'
    && existingMedia.upload_status === 'ready'
    && existingMedia.id === mediaId
    && existingMedia.moment_id === momentId
    && existingMedia.full_object === fullObjectId
    && existingMedia.thumb_object === thumbObjectId;
  const tagReady = existingTag?.upload_status === 'ready'
    && existingTag.moment_id === momentId
    && existingTag.moment_media_id === mediaId
    && existingTag.storage_object === fullObjectId
    && existingTag.thumb_object === thumbObjectId;
  return {
    complete: mediaReady && tagReady,
    mediaReady,
    tagReady,
    remoteReady: mediaReady || tagReady,
  };
}

export function canonicalVideoKeepComplete({ existingMedia, existingTag, momentId, mediaId, requireStream, providerPublished = false }) {
  const playable = requireStream
    ? !!existingMedia?.stream_uid && providerPublished
    : !!existingMedia?.full_object;
  return existingMedia?.media_type === 'video'
    && existingMedia.upload_status === 'ready'
    && existingMedia.id === mediaId
    && existingMedia.moment_id === momentId
    && playable
    && existingTag?.upload_status === 'ready'
    && existingTag.moment_id === momentId
    && existingTag.moment_media_id === mediaId
    && providerPublished;
}

export function canonicalPosterKeepComplete({ existingMedia, existingTag, momentId, mediaId, transferPublished = false }) {
  return existingMedia?.media_type === 'video'
    && existingMedia.upload_status === 'ready'
    && existingMedia.id === mediaId
    && existingMedia.moment_id === momentId
    && !!existingMedia.poster_object
    && existingTag?.upload_status === 'ready'
    && existingTag.moment_id === momentId
    && existingTag.moment_media_id === mediaId
    && existingTag.thumb_object === existingMedia.poster_object
    && transferPublished;
}

function normalizeObjectContext(value, kind) {
  if (!value || value.kind !== kind || !value.reservationId) return null;
  return {
    kind,
    reservationId: value.reservationId,
    state: ['reserved', 'uploaded', 'finalized', 'published'].includes(value.state) ? value.state : 'reserved',
    result: value.result ?? null,
  };
}

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
  reserve,
  persist,
  upload,
  finalize,
  abandon,
}) {
  if (complete) return { kind: 'image', state: 'finalized', reused: true };
  let current = normalizeObjectContext(context);
  if (current?.state === 'finalized') return current;

  if (!current?.reservationId) {
    const reservationId = await reserve();
    if (!reservationId) throw new Error('Canonical media quota reservation is required');
    current = { kind: 'image', reservationId, state: 'reserved' };
    try {
      await persist(current);
    } catch (error) {
      await abandon?.(reservationId).catch(() => undefined);
      throw error;
    }
  }

  if (current.state === 'reserved') {
    await upload(current);
    current = { ...current, state: 'uploaded' };
    await persist(current);
  }
  if (current.state === 'uploaded') {
    await finalize(current);
    current = { ...current, state: 'finalized' };
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

export function canonicalVideoKeepComplete({ existingMedia, existingTag, momentId, mediaId, requireStream, providerFinalized = false }) {
  const playable = requireStream
    ? !!existingMedia?.stream_uid && providerFinalized
    : !!existingMedia?.full_object;
  return existingMedia?.media_type === 'video'
    && existingMedia.upload_status === 'ready'
    && existingMedia.id === mediaId
    && existingMedia.moment_id === momentId
    && playable
    && existingTag?.upload_status === 'ready'
    && existingTag.moment_id === momentId
    && existingTag.moment_media_id === mediaId;
}

function normalizeObjectContext(value) {
  if (!value || value.kind !== 'image' || !value.reservationId) return null;
  return {
    kind: 'image',
    reservationId: value.reservationId,
    state: ['reserved', 'uploaded', 'finalized'].includes(value.state) ? value.state : 'reserved',
  };
}

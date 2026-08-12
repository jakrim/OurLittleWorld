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

export function legacyImageRowsMatch({ existingMedia, existingTag, momentId, mediaId, fullObjectId, thumbObjectId }) {
  const recoverableStates = new Set(['uploading', 'failed', 'ready']);
  const mediaMatches = existingMedia?.id === mediaId
    && existingMedia.moment_id === momentId
    && existingMedia.media_type === 'image'
    && existingMedia.full_object === fullObjectId
    && existingMedia.thumb_object === thumbObjectId
    && (!existingMedia.storage_provider || existingMedia.storage_provider === 'supabase')
    && recoverableStates.has(existingMedia.upload_status);
  const tagMatches = existingTag?.moment_id === momentId
    && existingTag.moment_media_id === mediaId
    && (
      (existingTag.storage_object === fullObjectId && existingTag.thumb_object === thumbObjectId)
      || (!existingTag.storage_object && !existingTag.thumb_object)
    )
    && recoverableStates.has(existingTag.upload_status);
  return mediaMatches && tagMatches;
}

export async function reconcileLegacyImageUpload({
  context = null,
  existingMedia,
  existingTag,
  momentId,
  mediaId,
  fullObjectId,
  thumbObjectId,
  readReservation,
  persist,
}) {
  if (context || !readReservation || !persist || !legacyImageRowsMatch({
    existingMedia,
    existingTag,
    momentId,
    mediaId,
    fullObjectId,
    thumbObjectId,
  })) return null;

  const reservation = await readReservation(mediaId);
  const reservationId = reservation?.reservation_id || reservation?.id || null;
  if (
    !reservationId
    || reservation?.canonical_media_id !== mediaId
    || reservation?.transport !== 'image'
    || !reservation?.storage_present
    || !['reserved', 'finalized'].includes(reservation?.status)
  ) {
    throw new Error('Legacy image Keep cannot prove its canonical upload state');
  }
  const next = {
    kind: 'image',
    reservationId,
    state: reservation.status === 'finalized' ? 'finalized' : 'uploaded',
    result: null,
  };
  await persist(next);
  return next;
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

export async function reconcileLegacyDirectVideoUpload({
  context = null,
  existingMedia,
  existingTag,
  momentId,
  mediaId,
  fullObjectId,
  readReservation,
  hasStorageObject,
  persist,
}) {
  return reconcileLegacyCanonicalObjectUpload({
    kind: 'video-direct',
    context,
    existingMedia,
    existingTag,
    momentId,
    mediaId,
    objectId: fullObjectId,
    rowsMatch: legacyDirectVideoRowsMatch({
      existingMedia,
      existingTag,
      momentId,
      mediaId,
      fullObjectId,
    }),
    readReservation,
    hasStorageObject,
    persist,
  });
}

export async function reconcileLegacyPosterVideoUpload({
  context = null,
  existingMedia,
  existingTag,
  momentId,
  mediaId,
  posterObjectId,
  readReservation,
  hasStorageObject,
  persist,
}) {
  return reconcileLegacyCanonicalObjectUpload({
    kind: 'video-poster',
    context,
    existingMedia,
    existingTag,
    momentId,
    mediaId,
    objectId: posterObjectId,
    rowsMatch: legacyPosterVideoRowsMatch({
      existingMedia,
      existingTag,
      momentId,
      mediaId,
      posterObjectId,
    }),
    readReservation,
    hasStorageObject,
    persist,
  });
}

async function reconcileLegacyCanonicalObjectUpload({
  kind,
  context,
  existingMedia,
  existingTag,
  momentId,
  mediaId,
  objectId,
  rowsMatch,
  readReservation,
  hasStorageObject,
  persist,
}) {
  if (context || !readReservation || !persist || !rowsMatch || !objectId) return null;

  const reservation = await readReservation(mediaId);
  if (!reservation) return null;
  const reservationId = reservation.reservation_id || reservation.id || null;
  if (
    !reservationId
    || reservation.canonical_media_id !== mediaId
    || reservation.transport !== kind
    || !['reserved', 'finalized'].includes(reservation.status)
  ) {
    throw new Error('Canonical video reservation evidence is inconsistent');
  }

  const storageObjectPresent = typeof reservation.storage_present === 'boolean'
    ? reservation.storage_present
    : await hasStorageObject?.();
  const result = posterResultFromRemoteRows(existingMedia, existingTag);
  let next = null;
  if (reservation.status === 'reserved') {
    next = {
      kind,
      reservationId,
      state: storageObjectPresent ? 'uploaded' : 'reserved',
      result,
    };
  } else if (reservation.status === 'finalized') {
    if (!storageObjectPresent) throw new Error('Canonical video object is missing');
    next = {
      kind,
      reservationId,
      state: existingMedia.upload_status === 'ready' && existingTag.upload_status === 'ready'
        ? 'published'
        : 'finalized',
      result,
    };
  }

  if (!next) return null;
  await persist(next);
  return next;
}

export function legacyDirectVideoRowsMatch({ existingMedia, existingTag, momentId, mediaId, fullObjectId }) {
  const mediaMatches = existingMedia?.id === mediaId
    && existingMedia.moment_id === momentId
    && existingMedia.media_type === 'video'
    && existingMedia.full_object === fullObjectId
    && existingMedia.storage_provider === 'supabase'
    && !existingMedia.stream_uid;
  const tagMatches = existingTag?.moment_id === momentId
    && existingTag.moment_media_id === mediaId
    && existingTag.storage_object === fullObjectId;
  return mediaMatches && tagMatches;
}

export function legacyPosterVideoRowsMatch({ existingMedia, existingTag, momentId, mediaId, posterObjectId }) {
  const mediaMatches = existingMedia?.id === mediaId
    && existingMedia.moment_id === momentId
    && existingMedia.media_type === 'video'
    && !existingMedia.full_object
    && existingMedia.poster_object === posterObjectId
    && existingMedia.storage_provider === 'supabase'
    && !existingMedia.stream_uid;
  const tagMatches = existingTag?.moment_id === momentId
    && existingTag.moment_media_id === mediaId
    && !existingTag.storage_object
    && existingTag.thumb_object === posterObjectId;
  return mediaMatches && tagMatches;
}

export function legacyRemoteAssetIdentityFromRows({
  familyId,
  ownerUserId,
  localAssetId,
  tags = [],
  media = null,
}) {
  const recoverableStates = new Set(['pending', 'uploading', 'ready', 'failed']);
  const matches = tags.filter((row) => row?.asset_id === localAssetId
    && row.family_id === familyId
    && row.asset_owner_user_id === ownerUserId
    && recoverableStates.has(row.upload_status));
  if (matches.length !== 1) return null;
  const tag = matches[0];
  if (
    !tag.moment_id
    || !tag.moment_media_id
    || media?.id !== tag.moment_media_id
    || media.moment_id !== tag.moment_id
    || media.family_id !== familyId
    || media.owner_user_id !== ownerUserId
    || media.local_identifier !== tag.asset_id
    || !recoverableStates.has(media.upload_status)
  ) return null;
  return {
    remoteAssetKey: tag.asset_id,
    momentId: tag.moment_id,
    mediaId: tag.moment_media_id,
  };
}

export function assertLegacyQueuedKeepResolved({ sourceJob, existingIdentity, legacyIdentity }) {
  if (sourceJob && !existingIdentity && !legacyIdentity) {
    throw new Error('Legacy queued Keep has no verifiable canonical target');
  }
  return legacyIdentity;
}

export async function canonicalizeUploadJob({ sourceJob, canonicalJobId, rekey }) {
  if (!canonicalJobId) throw new Error('Canonical upload job identity is required');
  if (sourceJob?.id && sourceJob.id !== canonicalJobId) {
    if (!rekey) throw new Error('Legacy upload job re-key is required');
    await rekey({ sourceJobId: sourceJob.id, canonicalJobId });
  }
  return canonicalJobId;
}

export function assertCanonicalVideoPublication({
  tagRow,
  mediaRow,
  familyId,
  ownerUserId,
  remoteAssetKey,
  momentId,
  mediaId,
}) {
  const tagPublished = tagRow?.family_id === familyId
    && tagRow.asset_owner_user_id === ownerUserId
    && tagRow.asset_id === remoteAssetKey
    && tagRow.moment_id === momentId
    && tagRow.moment_media_id === mediaId
    && tagRow.upload_status === 'ready';
  const mediaPublished = mediaRow?.id === mediaId
    && mediaRow.family_id === familyId
    && mediaRow.owner_user_id === ownerUserId
    && mediaRow.moment_id === momentId
    && mediaRow.upload_status === 'ready';
  if (!tagPublished || !mediaPublished) {
    throw new Error('Canonical video publication was not confirmed');
  }
  return { tagRow, mediaRow };
}

function posterResultFromRemoteRows(existingMedia, existingTag) {
  const posterObject = existingMedia?.poster_object || existingTag?.thumb_object || null;
  return {
    posterObject,
    posterMetadata: existingMedia?.metadata || {},
  };
}

function normalizeObjectContext(value, kind) {
  if (!value || value.kind !== kind) return null;
  if (!value.reservationId) return null;
  return {
    kind,
    reservationId: value.reservationId,
    state: ['reserved', 'uploaded', 'finalized', 'published'].includes(value.state) ? value.state : 'reserved',
    result: value.result ?? null,
  };
}

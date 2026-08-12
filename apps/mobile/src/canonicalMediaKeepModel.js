export function canonicalMediaProviderIdentity({ mediaId, existingMedia = null, existingTag = null } = {}) {
  if (!mediaId) throw new Error('Canonical media identity is required');
  return {
    fullObjectId: existingMedia?.full_object || existingTag?.storage_object || mediaId,
    thumbObjectId: existingMedia?.thumb_object || existingTag?.thumb_object || mediaId,
    posterObjectId: existingMedia?.poster_object
      || existingTag?.thumb_object
      || objectIdFromPath(existingMedia?.metadata?.posterPath)
      || mediaId,
  };
}

export async function ensureCanonicalMoment({ expected, read, insert }) {
  if (!expected?.id || !expected?.family_id || !expected?.author_user_id) {
    throw new Error('Canonical moment scope is incomplete');
  }
  const existing = await read(expected.id);
  if (existing) return validateCanonicalMoment(existing, expected);
  try {
    await insert(expected);
    return { created: true, moment: expected };
  } catch (error) {
    const raced = await read(expected.id);
    if (!raced) throw error;
    return validateCanonicalMoment(raced, expected);
  }
}

export async function confirmCanonicalKeepPreparation({ prepare, markStarted }) {
  const canonical = await prepare();
  await markStarted(canonical);
  return canonical;
}

export async function reconcileCanonicalKeepSideEffect({
  readMoment,
  readMedia,
  readTag,
  readReservation,
  markStarted,
}) {
  const [moment, media, tag, reservation] = await Promise.all([
    readMoment(),
    readMedia(),
    readTag(),
    readReservation(),
  ]);
  const evidence = { moment, media, tag, reservation };
  const found = Object.values(evidence).some(Boolean);
  if (found) await markStarted(evidence);
  return found;
}

export function assertCanonicalMediaIdentity(existing, expected) {
  if (!existing) return null;
  const fields = ['id', 'moment_id', 'family_id', 'owner_user_id', 'local_identifier'];
  if (fields.some((field) => String(existing[field] || '') !== String(expected?.[field] || ''))) {
    throw new Error('Canonical media identity belongs to another saved memory');
  }
  return existing;
}

export async function resumeCanonicalProviderUpload({ context = null, prepare, persist, upload }) {
  let current = normalizedProviderContext(context);
  if (['finalized', 'published'].includes(current?.state) && current.uid) return current;

  const prepared = normalizedProviderContext(await prepare(current));
  current = mergeProviderContext(current, prepared);
  if (!current?.uid || !current?.reservationId) throw new Error('Provider upload identity is incomplete');
  if (current.state === 'uploaded') {
    await persist(current);
    return current;
  }
  if (current.state === 'uploading' && !current.uploadURL) {
    await persist(current);
    throw new Error('Provider upload acceptance is still being confirmed');
  }
  if (!current.uploadURL) throw new Error('Provider upload URL is unavailable');

  current = { ...current, state: 'prepared' };
  await persist(current);
  current = { ...current, state: 'uploading' };
  await persist(current);
  await upload(current);
  current = { ...current, uploadURL: null, state: 'uploaded' };
  await persist(current);
  return current;
}

export async function finalizeCanonicalProviderUpload({ context, finalize, persist, publish }) {
  let current = normalizedProviderContext(context);
  if (!current?.uid || !current?.reservationId) throw new Error('Provider upload identity is incomplete');
  if (current.state === 'published') return current;
  if (current.state === 'uploaded') {
    await finalize(current);
    current = { ...current, uploadURL: null, state: 'finalized' };
    await persist(current);
  } else if (current.state !== 'finalized') {
    throw new Error('Provider upload is not ready to finalize');
  }

  if (publish) {
    await publish(current);
    current = { ...current, state: 'published' };
    await persist(current);
  }
  return current;
}

export async function resolveCanonicalPosterResult({
  contextResult = null,
  existingMedia = null,
  existingTag = null,
  upload,
}) {
  const contextPoster = contextResult?.posterObject || null;
  if (contextPoster) return contextResult;
  const readyMediaPoster = existingMedia?.upload_status === 'ready'
    ? existingMedia.poster_object || null
    : null;
  const readyTagPoster = existingTag?.upload_status === 'ready'
    ? existingTag.thumb_object || null
    : null;
  const publishedTagPoster = existingTag?.thumb_object || null;
  const publishedMediaPoster = existingMedia?.metadata?.posterSource
    ? existingMedia.poster_object || null
    : null;
  const matchedRemotePoster = existingMedia?.poster_object
    && existingTag?.thumb_object === existingMedia.poster_object
    ? existingMedia.poster_object
    : null;
  const existingPoster = matchedRemotePoster
    || publishedTagPoster
    || publishedMediaPoster
    || readyMediaPoster
    || readyTagPoster;
  if (existingPoster) {
    return {
      posterObject: existingPoster,
      posterMetadata: existingMedia?.metadata || {},
    };
  }
  return upload();
}

function validateCanonicalMoment(existing, expected) {
  if (
    String(existing.family_id || '') !== String(expected.family_id)
    || String(existing.author_user_id || '') !== String(expected.author_user_id)
  ) {
    throw new Error('Canonical moment identity belongs to another family record');
  }
  return { created: false, moment: existing };
}

function normalizedProviderContext(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    uid: value.uid || null,
    uploadURL: value.uploadURL || null,
    reservationId: value.reservationId || null,
    state: ['prepared', 'uploading', 'uploaded', 'finalized', 'published'].includes(value.state) ? value.state : 'prepared',
    result: value.result ?? null,
  };
}

function mergeProviderContext(current, prepared) {
  if (!prepared) return current;
  const sameProvider = current?.uid && current.uid === prepared.uid;
  return {
    ...prepared,
    uploadURL: prepared.state === 'uploaded'
      ? null
      : prepared.uploadURL || (sameProvider ? current.uploadURL : null),
  };
}

function objectIdFromPath(path) {
  const match = String(path || '').match(/\/([0-9a-f-]{36})\.jpg(?:\?|$)/i);
  return match?.[1] || null;
}

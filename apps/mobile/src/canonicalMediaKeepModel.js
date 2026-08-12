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
  if (current?.state === 'finalized' && current.uid) return current;

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

export async function finalizeCanonicalProviderUpload({ context, finalize, persist }) {
  const current = normalizedProviderContext(context);
  if (!current?.uid || !current?.reservationId) throw new Error('Provider upload identity is incomplete');
  if (current.state === 'finalized') return current;
  if (current.state !== 'uploaded') throw new Error('Provider upload is not ready to finalize');

  await finalize(current);
  const finalized = { ...current, uploadURL: null, state: 'finalized' };
  await persist(finalized);
  return finalized;
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
    state: ['prepared', 'uploading', 'uploaded', 'finalized'].includes(value.state) ? value.state : 'prepared',
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

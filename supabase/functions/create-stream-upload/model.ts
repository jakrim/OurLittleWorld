const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StreamVideo = Record<string, any> & {
  uid: string;
  creator?: string;
};

export type StreamVideoDisposition =
  | { action: 'invalid'; reservationId: null }
  | { action: 'uploaded' | 'replace' | 'uploading' | 'prepared'; reservationId: string };

export type CanonicalProviderClaim = {
  claimed: boolean;
  uid: string;
};

export async function authorizeCanonicalProviderAccess<T>({
  authorize,
  accessProvider,
}: {
  authorize: () => Promise<unknown>;
  accessProvider: () => Promise<T>;
}): Promise<T> {
  await authorize();
  return accessProvider();
}

export function canonicalStreamCreator(value: unknown) {
  const mediaId = String(value || '').trim();
  return UUID_PATTERN.test(mediaId) ? mediaId.toLowerCase() : null;
}

export function canonicalStreamUploadUrl(value: unknown) {
  const uid = String(value || '').trim();
  return /^[a-z0-9_-]+$/i.test(uid)
    ? `https://upload.videodelivery.net/${encodeURIComponent(uid)}`
    : null;
}

export async function claimCanonicalProviderIdentity({
  candidateUid,
  claim,
  cleanup,
}: {
  candidateUid: string;
  claim: (uid: string) => Promise<Record<string, any> | Record<string, any>[]>;
  cleanup: (uid: string) => Promise<void>;
}): Promise<CanonicalProviderClaim> {
  const candidate = String(candidateUid || '').trim();
  if (!candidate) throw new Error('Canonical provider candidate is required.');
  const response = await claim(candidate);
  const row = Array.isArray(response) ? response[0] : response;
  const winner = String(row?.winning_provider_object_id || '').trim();
  if (!winner) throw new Error('Canonical provider claim was not confirmed.');
  if (winner === candidate && row?.claimed === true) return { claimed: true, uid: winner };
  if (winner === candidate) throw new Error('Canonical provider claim returned an inconsistent winner.');
  await cleanup(candidate);
  return { claimed: false, uid: winner };
}

export function streamVideoDisposition(video: StreamVideo, {
  canonicalMediaId,
  familyId,
  providerState = null,
  nowMs = Date.now(),
}: {
  canonicalMediaId: string;
  familyId: string;
  providerState?: string | null;
  nowMs?: number;
}): StreamVideoDisposition {
  const meta = video?.meta && typeof video.meta === 'object' ? video.meta : {};
  const reservationId = String(meta.reservationId || '').trim();
  const creator = canonicalStreamCreator(video?.creator);
  if (
    !video?.uid
    || creator !== canonicalMediaId
    || String(meta.familyId || '') !== familyId
    || String(meta.canonicalMediaId || '').toLowerCase() !== canonicalMediaId
    || !reservationId
  ) {
    return { action: 'invalid', reservationId: null };
  }

  return uploadStateDisposition(video, reservationId, providerState, nowMs);
}

export function legacyStreamRetryDisposition({
  canonicalMediaId,
  familyId,
  userId,
  providerUid,
  providerState = null,
  reservation,
  media,
  video,
  nowMs = Date.now(),
}: {
  canonicalMediaId: string;
  familyId: string;
  userId: string;
  providerUid: string;
  providerState?: string | null;
  reservation: Record<string, any> | null;
  media: Record<string, any> | null;
  video: StreamVideo | null;
  nowMs?: number;
}): StreamVideoDisposition {
  const meta = video?.meta && typeof video.meta === 'object' ? video.meta : {};
  const rawCreator = String(video?.creator || '').trim();
  const creator = canonicalStreamCreator(video?.creator);
  const providerAttached = reservation?.provider === 'stream'
    && reservation.provider_object_id === providerUid;
  const legacyProviderUnattached = !reservation?.provider && !reservation?.provider_object_id;
  const valid = !!reservation?.id
    && reservation.family_id === familyId
    && reservation.user_id === userId
    && (providerAttached || legacyProviderUnattached)
    && ['reserved', 'finalized'].includes(reservation.status)
    && media?.id === canonicalMediaId
    && media.family_id === familyId
    && media.owner_user_id === userId
    && media.stream_uid === providerUid
    && video?.uid === providerUid
    && (!rawCreator || creator === canonicalMediaId)
    && meta.familyId === familyId
    && (!meta.canonicalMediaId || String(meta.canonicalMediaId).toLowerCase() === canonicalMediaId);
  if (!valid) return { action: 'invalid', reservationId: null };
  return uploadStateDisposition(video, reservation.id, providerState, nowMs);
}

function uploadStateDisposition(
  video: StreamVideo,
  reservationId: string,
  providerState: string | null,
  nowMs: number,
): StreamVideoDisposition {
  const state = String(video?.status?.state || '').toLowerCase();
  if (
    Number(video?.size || 0) > 0
    || video?.uploaded
    || ['downloading', 'queued', 'inprogress', 'ready', 'live-inprogress'].includes(state)
  ) {
    return { action: 'uploaded', reservationId };
  }
  if (state === 'error') return { action: 'replace', reservationId };
  if (state !== 'pendingupload') return { action: 'uploading', reservationId };

  const expiryMs = Date.parse(String(video?.uploadExpiry || ''));
  if (Number.isFinite(expiryMs) && expiryMs <= nowMs) {
    return { action: 'replace', reservationId };
  }
  return { action: 'prepared', reservationId };
}

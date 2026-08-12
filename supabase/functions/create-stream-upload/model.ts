const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StreamVideo = Record<string, any> & {
  uid: string;
  creator?: string;
};

export type StreamVideoDisposition =
  | { action: 'invalid'; reservationId: null }
  | { action: 'uploaded' | 'replace' | 'uploading' | 'prepared'; reservationId: string };

export function canonicalStreamCreator(value: unknown) {
  const mediaId = String(value || '').trim();
  return UUID_PATTERN.test(mediaId) ? mediaId.toLowerCase() : null;
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
  if (providerState === 'prepared') return { action: 'prepared', reservationId };
  if (providerState === 'uploading' || providerState === 'uploaded') {
    return { action: 'uploading', reservationId };
  }
  return { action: 'replace', reservationId };
}

import { supabase } from './supabase';
import { MediaPolicyError } from './mediaPolicy';

/**
 * Media session tokens + Stream playback URLs (plan: "R2 And Worker Media
 * Gateway"). Tokens come from the create-media-session Edge Function and are
 * cached until shortly before expiry so list hydration doesn't re-fetch.
 */

export const MEDIA_GATEWAY_URL = 'https://olw-media-gateway.ourlittleworld.workers.dev';

// Stream's simple one-shot upload caps out at 200 MB; larger sources fall
// back to the legacy Supabase upload path until tus resumable uploads land.
export const STREAM_SIMPLE_UPLOAD_MAX_BYTES = 200 * 1000 * 1000;

const sessionCache = new Map(); // familyId -> { token, expiresAtMs }

export async function getMediaSession(familyId) {
  if (!familyId) return null;
  const cached = sessionCache.get(familyId);
  if (cached && cached.expiresAtMs - Date.now() > 2 * 60 * 1000) return cached.token;

  const { data, error } = await supabase.functions.invoke('create-media-session', {
    body: { familyId },
  });
  if (error || !data?.token) {
    console.warn('create-media-session', error?.message || data?.error);
    return null;
  }
  sessionCache.set(familyId, {
    token: data.token,
    expiresAtMs: new Date(data.expiresAt).getTime(),
  });
  return data.token;
}

export function streamPlaybackUrl(familyId, streamUid, sessionToken) {
  if (!familyId || !streamUid || !sessionToken) return null;
  return `${MEDIA_GATEWAY_URL}/media/${familyId}/stream/${streamUid}?session=${encodeURIComponent(sessionToken)}`;
}

/**
 * Reserves quota server-side and mints a one-time Stream upload URL.
 * Over-plan rejections surface as MediaPolicyError so callers can offer the
 * poster-only / Vault paths.
 */
export async function createStreamUpload({ familyId, mediaId, durationSec, sourceBytes, context = null }) {
  const { data, error } = await supabase.functions.invoke('create-stream-upload', {
    body: {
      familyId,
      canonicalMediaId: mediaId,
      durationSec,
      sourceBytes,
      providerUid: context?.uid || null,
      reservationId: context?.reservationId || null,
      providerState: context?.state || null,
    },
  });
  const payload = data || (await parseFunctionError(error));
  if (payload?.error === 'over_plan_limit') {
    throw new MediaPolicyError(payload.reason || 'over_plan_limit');
  }
  if (error || !payload?.uid || !payload?.reservationId) {
    throw new Error(payload?.error || error?.message || 'Stream upload could not be prepared');
  }
  return payload;
}

async function parseFunctionError(error) {
  try {
    return await error?.context?.json();
  } catch {
    return null;
  }
}

/** Uploads the source video to a one-time Stream direct-upload URL. */
export async function uploadToStream({ uploadURL, uri, fileName, mimeType }) {
  const form = new FormData();
  form.append('file', {
    uri,
    name: fileName || 'video.mp4',
    type: mimeType || 'video/mp4',
  });
  const response = await fetch(uploadURL, { method: 'POST', body: form });
  if (!response.ok) {
    throw new Error(`Stream upload failed (${response.status})`);
  }
}

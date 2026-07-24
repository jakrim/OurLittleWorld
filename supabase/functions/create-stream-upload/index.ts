import {
  HttpError,
  corsHeaders,
  errorResponse,
  json,
  readJson,
  requireUser,
  requiredEnv,
  rpc,
} from '../_shared/billing.ts';

/**
 * Reserves video quota and mints a one-time Cloudflare Stream direct-upload
 * URL. The client uploads the source file straight to Stream, then calls
 * finalize_media_upload with the returned reservationId.
 *
 * Videos are created with requireSignedURLs, so playback only works through
 * the media gateway Worker.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const { token } = await requireUser(req);
    const body = await readJson(req);
    const familyId = String(body.familyId || body.family_id || '').trim();
    const durationSec = Math.max(0, Math.round(Number(body.durationSec || 0)));
    const sourceBytes = Math.max(0, Math.round(Number(body.sourceBytes || 0)));
    if (!familyId) throw new HttpError(400, 'Family is required.');

    // Reservation runs as the signed-in user: enforces family-writer role,
    // plan caps, and remaining quota in one place.
    const reservation = await rpc('reserve_media_upload', {
      target_family_id: familyId,
      p_media_type: 'video',
      p_bytes: sourceBytes,
      p_duration_sec: durationSec,
      p_quota_class: 'optimized',
    }, token);
    const row = Array.isArray(reservation) ? reservation[0] : reservation;
    if (!row?.allowed) {
      return json({ error: 'over_plan_limit', reason: row?.reason || 'not_allowed' }, 403);
    }

    const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
    const apiToken = requiredEnv('CLOUDFLARE_API_TOKEN');
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          maxDurationSeconds: Math.max(60, durationSec + 60),
          requireSignedURLs: true,
          meta: { familyId },
        }),
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.result?.uploadURL) {
      // Give the quota hold back; the client never got an upload URL.
      await rpc('release_media_upload', { p_reservation_id: row.reservation_id }, token).catch(() => undefined);
      throw new HttpError(502, payload?.errors?.[0]?.message || 'Stream upload could not be prepared.');
    }

    try {
      // Persist the provider UID before returning the upload URL. If the app
      // terminates before moment_media is finalized, account deletion can
      // still find and remove the orphaned Stream upload.
      await rpc('attach_media_upload_provider_object', {
        p_reservation_id: row.reservation_id,
        p_provider: 'stream',
        p_provider_object_id: payload.result.uid,
      }, token);
    } catch {
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${encodeURIComponent(payload.result.uid)}`,
        {
          method: 'DELETE',
          headers: { authorization: `Bearer ${apiToken}` },
        },
      ).catch(() => undefined);
      await rpc('release_media_upload', { p_reservation_id: row.reservation_id }, token).catch(() => undefined);
      throw new HttpError(502, 'Stream upload could not be recorded safely.');
    }

    return json({
      uploadURL: payload.result.uploadURL,
      uid: payload.result.uid,
      reservationId: row.reservation_id,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

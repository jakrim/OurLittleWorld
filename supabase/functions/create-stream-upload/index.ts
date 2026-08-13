import {
  HttpError,
  corsHeaders,
  errorResponse,
  json,
  readJson,
  requireUser,
  requiredEnv,
  rpc,
  supabaseRequest,
} from '../_shared/billing.ts';
import {
  authorizeCanonicalProviderAccess,
  canonicalStreamCreator,
  canonicalStreamUploadUrl,
  claimCanonicalProviderIdentity,
  legacyStreamRetryDisposition,
  reconcileAbsentProviderCleanup,
  streamVideoDisposition,
  type StreamVideo,
} from './model.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const { token, user } = await requireUser(req);
    const body = await readJson(req);
    const familyId = String(body.familyId || body.family_id || '').trim();
    const canonicalMediaId = canonicalStreamCreator(body.canonicalMediaId || body.canonical_media_id);
    let providerUid = String(body.providerUid || body.provider_uid || '').trim() || null;
    const providerReservationId = canonicalStreamCreator(body.reservationId || body.reservation_id);
    const providerState = ['prepared', 'uploading', 'uploaded'].includes(String(body.providerState || ''))
      ? String(body.providerState)
      : null;
    const durationSec = Math.max(0, Math.round(Number(body.durationSec || 0)));
    const sourceBytes = Math.max(0, Math.round(Number(body.sourceBytes || 0)));
    if (!familyId) throw new HttpError(400, 'Family is required.');
    if (!canonicalMediaId) throw new HttpError(400, 'Canonical media identity is required.');

    const { accountId, apiToken, videos } = await authorizeCanonicalProviderAccess({
      authorize: () => rpc('authorize_canonical_media_upload', {
        target_family_id: familyId,
      }, token),
      accessProvider: async () => {
        const nextAccountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
        const nextApiToken = requiredEnv('CLOUDFLARE_API_TOKEN');
        const nextVideos = await listCanonicalVideos({
          accountId: nextAccountId,
          apiToken: nextApiToken,
          canonicalMediaId,
        });
        return {
          accountId: nextAccountId,
          apiToken: nextApiToken,
          videos: nextVideos,
        };
      },
    });
    const canonicalReservation = await readReservationByCanonical({
      canonicalMediaId,
      familyId,
      userId: user.id,
      token,
    });
    if (!providerUid && canonicalReservation?.provider === 'stream') {
      providerUid = canonicalReservation.provider_object_id || null;
    }
    if (providerUid && !videos.some((video) => video.uid === providerUid)) {
      const attachedReservation = canonicalReservation?.provider_object_id === providerUid
        ? canonicalReservation
        : null;
      if (attachedReservation) {
        const attachedVideo = await getStreamVideo({ accountId, apiToken, uid: providerUid });
        const released = await reconcileAbsentProviderCleanup({
          canonicalMediaId,
          familyId,
          userId: user.id,
          providerUid,
          reservation: attachedReservation,
          video: attachedVideo,
          confirmAndRelease: (reservationId, uid) => releaseReservation(reservationId, uid),
        });
        if (released) providerUid = null;
      }
    }
    if (providerUid && !videos.some((video) => video.uid === providerUid)) {
      const [reservation, media] = await Promise.all([
        providerReservationId
          ? readReservation({ reservationId: providerReservationId, familyId, userId: user.id, token })
          : readReservationByProvider({ providerUid, familyId, userId: user.id, token }),
        readCanonicalMedia({ canonicalMediaId, providerUid, familyId, userId: user.id, token }),
      ]);
      const canonicalProviderBound = reservation?.canonical_media_id === canonicalMediaId
        && reservation?.transport === 'video-stream'
        && reservation?.provider === 'stream'
        && reservation?.provider_object_id === providerUid;
      const legacyVideo = reservation && (media || canonicalProviderBound)
        ? await getStreamVideo({ accountId, apiToken, uid: providerUid })
        : null;
      const disposition = canonicalProviderBound && legacyVideo
        ? streamVideoDisposition(legacyVideo, { canonicalMediaId, familyId, providerState })
        : legacyStreamRetryDisposition({
          canonicalMediaId,
          familyId,
          userId: user.id,
          providerUid,
          providerState,
          reservation,
          media,
          video: legacyVideo,
        });
      if (disposition.action === 'invalid') {
        throw new HttpError(409, 'Canonical provider identity is inconsistent.');
      }
      if (canonicalProviderBound && disposition.reservationId !== reservation.id) {
        throw new HttpError(409, 'Canonical provider identity is inconsistent.');
      }
      const attachedUid = await ensureProviderAttachment({ reservation, uid: providerUid, token });
      if (attachedUid !== providerUid) {
        throw new HttpError(409, 'Canonical upload reservation belongs to another provider object.');
      }
      if (reservation?.status === 'finalized' && disposition.action !== 'uploaded') {
        throw new HttpError(409, 'The finalized Stream upload could not be reconciled safely.');
      }
      if (disposition.action !== 'replace') {
        await removeCanonicalDuplicates({
          videos,
          canonicalMediaId,
          familyId,
          userId: user.id,
          token,
          accountId,
          apiToken,
          selectedReservationId: reservation.id,
        });
        if (disposition.action === 'uploaded') {
          await confirmCanonicalProviderUpload({
            reservationId: reservation.id,
            providerObjectId: providerUid,
          });
        }
        return json({
          ...(disposition.action === 'prepared' ? { uploadURL: canonicalStreamUploadUrl(providerUid) } : {}),
          uid: providerUid,
          reservationId: disposition.reservationId,
          state: disposition.action,
        });
      }
      if (reservation?.status === 'finalized') {
        throw new HttpError(409, 'The finalized Stream upload could not be reconciled safely.');
      }
      await deleteStreamVideo({ accountId, apiToken, uid: providerUid });
      await releaseReservation(disposition.reservationId, providerUid);
    }
    if (videos.length) {
      let selected = videos.find((video) => video.uid === providerUid) || videos[0];
      let selectedDisposition = streamVideoDisposition(selected, {
        canonicalMediaId,
        familyId,
        providerState: selected.uid === providerUid ? providerState : null,
      });
      if (selectedDisposition.action === 'invalid') {
        throw new HttpError(409, 'Canonical provider identity is inconsistent.');
      }
      const reservation = await readReservation({
        reservationId: selectedDisposition.reservationId,
        familyId,
        userId: user.id,
        token,
      });
      const attachedUid = await ensureProviderAttachment({ reservation, uid: selected.uid, token });
      if (attachedUid !== selected.uid) {
        const winningVideo = videos.find((video) => video.uid === attachedUid)
          || await getStreamVideo({ accountId, apiToken, uid: attachedUid });
        if (!winningVideo) {
          throw new HttpError(409, 'Canonical provider winner could not be reconciled safely.');
        }
        const winningDisposition = streamVideoDisposition(winningVideo, { canonicalMediaId, familyId });
        if (
          winningDisposition.action === 'invalid'
          || winningDisposition.reservationId !== reservation.id
        ) {
          throw new HttpError(409, 'Canonical provider winner could not be reconciled safely.');
        }
        selected = winningVideo;
        selectedDisposition = winningDisposition;
      }
      if (reservation.status === 'finalized' && selectedDisposition.action !== 'uploaded') {
        throw new HttpError(409, 'The finalized Stream upload could not be reconciled safely.');
      }

      for (const duplicate of videos.filter((video) => video.uid !== selected.uid)) {
        const duplicateDisposition = streamVideoDisposition(duplicate, {
          canonicalMediaId,
          familyId,
          providerState: null,
        });
        if (duplicateDisposition.action === 'invalid') {
          throw new HttpError(409, 'Canonical provider identity is inconsistent.');
        }
        const duplicateReservation = await readReservation({
          reservationId: duplicateDisposition.reservationId,
          familyId,
          userId: user.id,
          token,
        });
        if (duplicateReservation.status === 'finalized') {
          throw new HttpError(409, 'A duplicate finalized Stream upload requires reconciliation.');
        }
        await deleteStreamVideo({ accountId, apiToken, uid: duplicate.uid });
        if (duplicateDisposition.reservationId !== selectedDisposition.reservationId) {
          await releaseReservation(duplicateDisposition.reservationId, duplicate.uid);
        }
      }

      if (selectedDisposition.action === 'uploaded') {
        await confirmCanonicalProviderUpload({
          reservationId: selectedDisposition.reservationId,
          providerObjectId: selected.uid,
        });
        return json({
          uid: selected.uid,
          reservationId: selectedDisposition.reservationId,
          state: 'uploaded',
        });
      }
      if (selectedDisposition.action === 'prepared') {
        return json({
          uploadURL: canonicalStreamUploadUrl(selected.uid),
          uid: selected.uid,
          reservationId: selectedDisposition.reservationId,
          state: 'prepared',
        });
      }
      if (selectedDisposition.action === 'uploading') {
        return json({
          uid: selected.uid,
          reservationId: selectedDisposition.reservationId,
          state: 'uploading',
        });
      }

      if (reservation.status === 'finalized') {
        throw new HttpError(409, 'The finalized Stream upload could not be reconciled safely.');
      }

      await deleteStreamVideo({ accountId, apiToken, uid: selected.uid });
      await releaseReservation(selectedDisposition.reservationId, selected.uid);
    }

    const reservation = await rpc('reserve_canonical_media_upload', {
      target_family_id: familyId,
      p_canonical_media_id: canonicalMediaId,
      p_transport: 'video-stream',
      p_media_type: 'video',
      p_bytes: sourceBytes,
      p_duration_sec: durationSec,
      p_quota_class: 'optimized',
    }, token);
    const row = Array.isArray(reservation) ? reservation[0] : reservation;
    if (!row?.allowed) {
      return json({ error: 'over_plan_limit', reason: row?.reason || 'not_allowed' }, 403);
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiToken}`,
          'content-type': 'application/json',
          'Upload-Creator': canonicalMediaId,
        },
        body: JSON.stringify({
          maxDurationSeconds: Math.max(60, durationSec + 60),
          requireSignedURLs: true,
          meta: { familyId, canonicalMediaId, reservationId: row.reservation_id },
        }),
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.result?.uploadURL || !payload?.result?.uid) {
      if (payload?.result?.uid) {
        await deleteStreamVideo({ accountId, apiToken, uid: payload.result.uid }).catch(() => undefined);
      }
      throw new HttpError(502, payload?.errors?.[0]?.message || 'Stream upload could not be prepared.');
    }

    let providerClaim;
    try {
      providerClaim = await claimCanonicalProviderIdentity({
        candidateUid: payload.result.uid,
        claim: (uid) => trustedRpc('claim_canonical_media_upload_provider_object', {
          p_reservation_id: row.reservation_id,
          p_provider: 'stream',
          p_provider_object_id: uid,
        }),
        cleanup: (uid) => deleteStreamVideo({ accountId, apiToken, uid }),
      });
    } catch {
      let reconciled = null;
      try {
        reconciled = await readReservation({
          reservationId: row.reservation_id,
          familyId,
          userId: user.id,
          token,
        });
      } catch {
        throw new HttpError(502, 'Stream upload could not be recorded safely.');
      }
      if (reconciled.provider === 'stream' && reconciled.provider_object_id === payload.result.uid) {
        providerClaim = { claimed: true, uid: payload.result.uid };
      } else if (reconciled.provider === 'stream' && reconciled.provider_object_id) {
        await deleteStreamVideo({ accountId, apiToken, uid: payload.result.uid });
        providerClaim = { claimed: false, uid: reconciled.provider_object_id };
      } else {
        await deleteStreamVideo({ accountId, apiToken, uid: payload.result.uid }).catch(() => undefined);
        throw new HttpError(502, 'Stream upload could not be recorded safely.');
      }
    }

    if (!providerClaim.claimed) {
      const winningVideo = await getStreamVideo({ accountId, apiToken, uid: providerClaim.uid });
      const winningDisposition = winningVideo
        ? streamVideoDisposition(winningVideo, { canonicalMediaId, familyId })
        : { action: 'invalid' as const, reservationId: null };
      if (
        winningDisposition.action === 'invalid'
        || winningDisposition.reservationId !== row.reservation_id
      ) {
        throw new HttpError(409, 'Canonical provider winner could not be reconciled safely.');
      }
      if (winningDisposition.action === 'replace') {
        throw new HttpError(409, 'Canonical provider winner is no longer resumable.');
      }
      if (winningDisposition.action === 'uploaded') {
        await confirmCanonicalProviderUpload({
          reservationId: row.reservation_id,
          providerObjectId: providerClaim.uid,
        });
      }
      return json({
        ...(winningDisposition.action === 'prepared'
          ? { uploadURL: canonicalStreamUploadUrl(providerClaim.uid) }
          : {}),
        uid: providerClaim.uid,
        reservationId: row.reservation_id,
        state: winningDisposition.action,
      });
    }

    return json({
      uploadURL: payload.result.uploadURL,
      uid: payload.result.uid,
      reservationId: row.reservation_id,
      state: 'prepared',
    });
  } catch (error) {
    return errorResponse(error);
  }
});

async function listCanonicalVideos({ accountId, apiToken, canonicalMediaId }: {
  accountId: string;
  apiToken: string;
  canonicalMediaId: string;
}): Promise<StreamVideo[]> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?creator=${encodeURIComponent(canonicalMediaId)}&limit=100`,
    { headers: { authorization: `Bearer ${apiToken}` } },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload?.result)) {
    throw new HttpError(502, payload?.errors?.[0]?.message || 'Stream upload status could not be checked.');
  }
  return (payload.result as StreamVideo[]).sort((left, right) => (
    String(left.created || '').localeCompare(String(right.created || ''))
  ));
}

async function readReservation({ reservationId, familyId, userId, token }: {
  reservationId: string;
  familyId: string;
  userId: string;
  token: string;
}) {
  const query = new URLSearchParams({
    id: `eq.${reservationId}`,
    family_id: `eq.${familyId}`,
    user_id: `eq.${userId}`,
    select: 'id,family_id,user_id,status,provider,provider_object_id,provider_cleanup_required,canonical_media_id,transport',
    limit: '1',
  });
  const rows = await supabaseRequest(`/rest/v1/media_upload_reservations?${query}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  }, token);
  const reservation = Array.isArray(rows) ? rows[0] : null;
  if (!reservation || !['reserved', 'finalized'].includes(reservation.status)) {
    throw new HttpError(409, 'Canonical upload reservation is no longer available.');
  }
  return reservation;
}

async function readReservationByCanonical({ canonicalMediaId, familyId, userId, token }: {
  canonicalMediaId: string;
  familyId: string;
  userId: string;
  token: string;
}) {
  const query = new URLSearchParams({
    canonical_media_id: `eq.${canonicalMediaId}`,
    transport: 'eq.video-stream',
    family_id: `eq.${familyId}`,
    user_id: `eq.${userId}`,
    status: 'in.(reserved,finalized)',
    select: 'id,family_id,user_id,status,provider,provider_object_id,provider_cleanup_required,canonical_media_id,transport',
    limit: '2',
  });
  const rows = await supabaseRequest(`/rest/v1/media_upload_reservations?${query}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  }, token);
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function readReservationByProvider({ providerUid, familyId, userId, token }: {
  providerUid: string;
  familyId: string;
  userId: string;
  token: string;
}) {
  const query = new URLSearchParams({
    provider: 'eq.stream',
    provider_object_id: `eq.${providerUid}`,
    family_id: `eq.${familyId}`,
    user_id: `eq.${userId}`,
    select: 'id,family_id,user_id,status,provider,provider_object_id,provider_cleanup_required,canonical_media_id,transport',
    limit: '2',
  });
  const rows = await supabaseRequest(`/rest/v1/media_upload_reservations?${query}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  }, token);
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function readCanonicalMedia({ canonicalMediaId, providerUid, familyId, userId, token }: {
  canonicalMediaId: string;
  providerUid: string;
  familyId: string;
  userId: string;
  token: string;
}) {
  const query = new URLSearchParams({
    id: `eq.${canonicalMediaId}`,
    family_id: `eq.${familyId}`,
    owner_user_id: `eq.${userId}`,
    stream_uid: `eq.${providerUid}`,
    select: 'id,family_id,owner_user_id,stream_uid',
    limit: '2',
  });
  const rows = await supabaseRequest(`/rest/v1/moment_media?${query}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  }, token);
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function getStreamVideo({ accountId, apiToken, uid }: {
  accountId: string;
  apiToken: string;
  uid: string;
}): Promise<StreamVideo | null> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${encodeURIComponent(uid)}`,
    { headers: { authorization: `Bearer ${apiToken}` } },
  );
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.result) {
    throw new HttpError(502, payload?.errors?.[0]?.message || 'Stream upload status could not be checked.');
  }
  return payload.result as StreamVideo;
}

async function removeCanonicalDuplicates({
  videos,
  canonicalMediaId,
  familyId,
  userId,
  token,
  accountId,
  apiToken,
  selectedReservationId,
}: {
  videos: StreamVideo[];
  canonicalMediaId: string;
  familyId: string;
  userId: string;
  token: string;
  accountId: string;
  apiToken: string;
  selectedReservationId: string;
}) {
  for (const duplicate of videos) {
    const disposition = streamVideoDisposition(duplicate, {
      canonicalMediaId,
      familyId,
      providerState: null,
    });
    if (disposition.action === 'invalid') {
      throw new HttpError(409, 'Canonical provider identity is inconsistent.');
    }
    const reservation = await readReservation({
      reservationId: disposition.reservationId,
      familyId,
      userId,
      token,
    });
    if (reservation.status === 'finalized') {
      throw new HttpError(409, 'A duplicate finalized Stream upload requires reconciliation.');
    }
    await deleteStreamVideo({ accountId, apiToken, uid: duplicate.uid });
    if (disposition.reservationId !== selectedReservationId) {
      await releaseReservation(disposition.reservationId, duplicate.uid);
    }
  }
}

async function ensureProviderAttachment({ reservation, uid, token }: {
  reservation: Record<string, any>;
  uid: string;
  token: string;
}) {
  if (reservation.provider && reservation.provider !== 'stream') {
    throw new HttpError(409, 'Canonical upload reservation belongs to another provider object.');
  }
  if (reservation.provider_object_id) return reservation.provider_object_id;
  if (reservation.status === 'finalized' && !reservation.provider) {
    throw new HttpError(409, 'The finalized Stream upload could not be reconciled safely.');
  }
  if (!reservation.canonical_media_id) {
    await rpc('attach_media_upload_provider_object', {
      p_reservation_id: reservation.id,
      p_provider: 'stream',
      p_provider_object_id: uid,
    }, token);
    return uid;
  }
  const claim = await trustedRpc('claim_canonical_media_upload_provider_object', {
    p_reservation_id: reservation.id,
    p_provider: 'stream',
    p_provider_object_id: uid,
  });
  const row = Array.isArray(claim) ? claim[0] : claim;
  const winner = String(row?.winning_provider_object_id || '').trim();
  if (!winner) throw new HttpError(409, 'Canonical provider claim was not confirmed.');
  return winner;
}

async function confirmCanonicalProviderUpload({ reservationId, providerObjectId }: {
  reservationId: string;
  providerObjectId: string;
}) {
  await trustedRpc('confirm_canonical_media_provider_upload', {
    p_reservation_id: reservationId,
    p_provider: 'stream',
    p_provider_object_id: providerObjectId,
  });
}

async function trustedRpc(name: string, body: Record<string, unknown>) {
  const supabaseUrl = requiredEnv('SUPABASE_URL');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new HttpError(502, 'The Stream upload could not be recorded safely.');
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function deleteStreamVideo({ accountId, apiToken, uid }: {
  accountId: string;
  apiToken: string;
  uid: string;
}) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${encodeURIComponent(uid)}`,
    {
      method: 'DELETE',
      headers: { authorization: `Bearer ${apiToken}` },
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new HttpError(502, 'The prior Stream upload could not be reconciled safely.');
  }
}

async function releaseReservation(reservationId: string | null, providerObjectId: string) {
  if (!reservationId) return;
  const supabaseUrl = requiredEnv('SUPABASE_URL');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/confirm_and_release_media_upload_provider_cleanup`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      p_reservation_id: reservationId,
      p_provider: 'stream',
      p_provider_object_id: providerObjectId,
    }),
  });
  if (!response.ok) {
    throw new HttpError(502, 'The prior Stream upload cleanup could not be recorded safely.');
  }
}

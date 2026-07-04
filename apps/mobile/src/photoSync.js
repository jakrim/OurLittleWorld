import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { getAssetDetails } from './photos';
import {
  assertVideoWithinPlan,
  fileSizeOf,
  finalizeMediaUpload,
  releaseMediaUpload,
  reserveMediaUpload,
} from './mediaPolicy';
import { uuid } from './moments';
import { supabase } from './supabase';

/**
 * Cloud photo pipeline.
 *
 *   uploadForTag({ familyId, assetId })   tag a photo and push thumb + full to Storage
 *   deleteForTag({ photoTag })            remove the storage objects + the tag row
 *   listSharedTagged(familyId)            paged list of family-wide tagged photos with signed URLs
 *   backfillPendingForOwner({familyId})   resume any uploads that haven't completed for this device's library
 *
 * Storage layout (private bucket "family-photos"):
 *   {family_id}/full/{uuid}.jpg
 *   {family_id}/thumb/{uuid}.jpg
 *
 * RLS lets only family members read / write under {family_id}/.
 */

const BUCKET = 'family-photos';
const FULL_MAX_DIM = 1600;
const THUMB_MAX_DIM = 640;
const FULL_QUALITY = 0.85;
const THUMB_QUALITY = 0.75;
const VIDEO_POSTER_MAX_DIM = 960;
const VIDEO_POSTER_QUALITY = 0.8;
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h

const signedUrlCache = new Map(); // key -> { url, expiresAt }

function normalizeLocation(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

async function readAsArrayBuffer(uri) {
  return new File(uri).arrayBuffer();
}

async function uploadBuffer(path, uri, contentType) {
  const body = await readAsArrayBuffer(uri);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType, upsert: true });
  if (error) throw error;
  return data;
}

async function resize(uri, maxDim, compress) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxDim } }],
    { compress, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result; // { uri, width, height }
}

function extensionForVideo(info) {
  const raw = String(info?.fileName || info?.localUri || info?.uri || '').split('?')[0];
  const ext = raw.split('.').pop()?.toLowerCase();
  if (['mov', 'mp4', 'm4v'].includes(ext)) return ext;
  return 'mp4';
}

function mimeTypeForVideo(ext) {
  return ext === 'mov' ? 'video/quicktime' : 'video/mp4';
}

function posterTimeForVideo(info, match) {
  if (Number.isFinite(match?.frameTimeMs)) return Math.max(0, Number(match.frameTimeMs));
  const durationMs = Number(info?.duration || 0);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1000;
  return Math.max(500, Math.min(3000, Math.round(durationMs * 0.08)));
}

async function createVideoPoster({ info, match }) {
  const sourceFrame = match?.localUri || match?.uri;
  if (sourceFrame && !String(sourceFrame).startsWith('ph://')) {
    const poster = await resize(sourceFrame, VIDEO_POSTER_MAX_DIM, VIDEO_POSTER_QUALITY);
    return {
      uri: poster.uri,
      width: poster.width || match?.width || info?.width || null,
      height: poster.height || match?.height || info?.height || null,
      timeMs: Number.isFinite(match?.frameTimeMs) ? Number(match.frameTimeMs) : null,
      source: 'recognition-frame',
    };
  }

  const frameTimeMs = posterTimeForVideo(info, match);
  const frame = await VideoThumbnails.getThumbnailAsync(info.localUri || info.uri, {
    time: frameTimeMs,
    quality: 0.9,
  });
  const poster = await resize(frame.uri, VIDEO_POSTER_MAX_DIM, VIDEO_POSTER_QUALITY);
  return {
    uri: poster.uri,
    width: poster.width || frame.width || info?.width || null,
    height: poster.height || frame.height || info?.height || null,
    timeMs: frameTimeMs,
    source: 'generated-frame',
  };
}

/**
 * Tags a photo and uploads thumb + full to Storage. Atomic from the user's
 * point of view: the tag row exists immediately (status='pending'), then
 * upload + status='ready' happen async.
 */
export async function uploadForTag({ familyId, assetId, match = null, videoPosterOnly = false }) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error('Not signed in');
  if (!familyId) throw new Error('No family');

  const info = await getAssetDetails(assetId, { downloadFromNetwork: true });
  if (!info) throw new Error('Could not load media from library');
  const localUri = info.localUri || info.uri;
  if (!localUri) {
    throw new Error(info.downloadError || 'Could not download this media from iCloud. Try again after it finishes downloading in Photos.');
  }
  if (info.mediaType === 'video') {
    if (videoPosterOnly) {
      return savePosterOnlyVideoForTag({ familyId, assetId, userId, info, match });
    }
    return uploadVideoForTag({ familyId, assetId, userId, info, match });
  }
  const location = normalizeLocation(info.location);
  const nowIso = new Date().toISOString();
  const creationTime = info.creationTime ? new Date(info.creationTime).toISOString() : null;
  const { data: existingTag, error: existingErr } = await supabase
    .from('photo_tags')
    .select('moment_id, moment_media_id')
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', userId)
    .eq('asset_id', assetId)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const momentId = existingTag?.moment_id || uuid();
  const mediaId = existingTag?.moment_media_id || uuid();
  const fullId = uuid();
  const thumbId = uuid();
  const fullPath = `${familyId}/full/${fullId}.jpg`;
  const thumbPath = `${familyId}/thumb/${thumbId}.jpg`;

  if (!existingTag?.moment_id) {
    const { error: momentErr } = await supabase.from('moments').insert({
      id: momentId,
      family_id: familyId,
      author_user_id: userId,
      captured_at: creationTime || nowIso,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      shared_with: [],
    });
    if (momentErr) throw momentErr;
  }

  const { error: mediaErr } = await supabase.from('moment_media').upsert(
    {
      id: mediaId,
      moment_id: momentId,
      family_id: familyId,
      owner_user_id: userId,
      media_type: 'image',
      local_identifier: assetId,
      mime_type: 'image/jpeg',
      full_object: fullId,
      thumb_object: thumbId,
      width: info.width || null,
      height: info.height || null,
      metadata: {
        source: 'library-review',
        localAssetId: assetId,
        fullPath,
        thumbPath,
      },
      upload_status: 'uploading',
      upload_error: null,
      sort_order: 0,
    },
    { onConflict: 'id' },
  );
  if (mediaErr) throw mediaErr;

  // 1. Insert (or refresh) the tag row in pending state
  const { error: upsertErr } = await supabase.from('photo_tags').upsert(
    {
      family_id: familyId,
      asset_owner_user_id: userId,
      asset_id: assetId,
      tagged_by_user_id: userId,
      tagged_at: nowIso,
      creation_time: creationTime,
      original_width: info.width || null,
      original_height: info.height || null,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      location_fetched_at: nowIso,
      upload_status: 'uploading',
      upload_error: null,
      moment_id: momentId,
      moment_media_id: mediaId,
    },
    { onConflict: 'family_id,asset_owner_user_id,asset_id' },
  );
  if (upsertErr) throw upsertErr;

  let reservationId = null;
  try {
    // Chain: decode the (often 12MP) original once, downscale to "full"
    // size, then downscale that result to "thumb". Halves the JPEG decode
    // cost compared to running both resizes against the original.
    const full = await resize(localUri, FULL_MAX_DIM, FULL_QUALITY);
    const thumb = await resize(full.uri, THUMB_MAX_DIM, THUMB_QUALITY);

    const [fullBuf, thumbBuf] = await Promise.all([
      readAsArrayBuffer(full.uri),
      readAsArrayBuffer(thumb.uri),
    ]);

    const derivativeBytes = (fullBuf.byteLength || 0) + (thumbBuf.byteLength || 0);
    reservationId = await reserveMediaUpload({ familyId, mediaType: 'image', bytes: derivativeBytes });

    const opts = { contentType: 'image/jpeg', upsert: true };
    const [fullRes, thumbRes] = await Promise.all([
      supabase.storage.from(BUCKET).upload(fullPath, fullBuf, opts),
      supabase.storage.from(BUCKET).upload(thumbPath, thumbBuf, opts),
    ]);
    if (fullRes.error) throw fullRes.error;
    if (thumbRes.error) throw thumbRes.error;

    await finalizeMediaUpload(reservationId, { bytes: derivativeBytes });
    reservationId = null;

    const [tagDone, mediaDone] = await Promise.all([
      supabase
        .from('photo_tags')
        .update({
          storage_object: fullId,
          thumb_object: thumbId,
          original_width: full.width,
          original_height: full.height,
          upload_status: 'ready',
          upload_error: null,
          moment_id: momentId,
          moment_media_id: mediaId,
        })
        .eq('family_id', familyId)
        .eq('asset_owner_user_id', userId)
        .eq('asset_id', assetId),
      supabase
        .from('moment_media')
        .update({
          width: full.width,
          height: full.height,
          upload_status: 'ready',
          upload_error: null,
        })
        .eq('id', mediaId),
    ]);
    if (tagDone.error) throw tagDone.error;
    if (mediaDone.error) throw mediaDone.error;

    return { fullId, thumbId };
  } catch (err) {
    await releaseMediaUpload(reservationId);
    await Promise.all([
      supabase
        .from('photo_tags')
        .update({ upload_status: 'failed', upload_error: String(err?.message || err) })
        .eq('family_id', familyId)
        .eq('asset_owner_user_id', userId)
        .eq('asset_id', assetId),
      supabase
        .from('moment_media')
        .update({ upload_status: 'failed', upload_error: String(err?.message || err) })
        .eq('id', mediaId),
    ]);
    throw err;
  }
}

async function uploadVideoForTag({ familyId, assetId, userId, info, match }) {
  const durationSec = info.duration ? Number(info.duration) / 1000 : null;
  const sourceBytes = fileSizeOf(info.localUri || info.uri);
  await assertVideoWithinPlan({ familyId, durationSec, sourceBytes });

  const location = normalizeLocation(info.location);
  const nowIso = new Date().toISOString();
  const creationTime = info.creationTime ? new Date(info.creationTime).toISOString() : null;
  const { data: existingTag, error: existingErr } = await supabase
    .from('photo_tags')
    .select('moment_id, moment_media_id')
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', userId)
    .eq('asset_id', assetId)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const momentId = existingTag?.moment_id || uuid();
  const mediaId = existingTag?.moment_media_id || uuid();
  const fullId = uuid();
  const posterId = uuid();
  const ext = extensionForVideo(info);
  const mimeType = mimeTypeForVideo(ext);
  const fullPath = `${familyId}/moments/${momentId}/video/${fullId}.${ext}`;
  const posterPath = `${familyId}/moments/${momentId}/video-poster/${posterId}.jpg`;
  const metadata = {
    source: 'library-review',
    localAssetId: assetId,
    fullPath,
    posterPath,
    recognitionFrameTimeMs: match?.frameTimeMs ?? null,
    recognitionCandidateId: match?.candidateId || null,
    originalFileName: info.fileName || match?.fileName || null,
  };

  if (!existingTag?.moment_id) {
    const { error: momentErr } = await supabase.from('moments').insert({
      id: momentId,
      family_id: familyId,
      author_user_id: userId,
      captured_at: creationTime || nowIso,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      shared_with: [],
    });
    if (momentErr) throw momentErr;
  }

  const { error: mediaErr } = await supabase.from('moment_media').upsert(
    {
      id: mediaId,
      moment_id: momentId,
      family_id: familyId,
      owner_user_id: userId,
      media_type: 'video',
      local_identifier: assetId,
      file_name: info.fileName || match?.fileName || null,
      mime_type: mimeType,
      full_object: fullId,
      poster_object: null,
      width: info.width || null,
      height: info.height || null,
      duration_sec: info.duration ? Number(info.duration) / 1000 : null,
      metadata,
      upload_status: 'uploading',
      upload_error: null,
      sort_order: 0,
    },
    { onConflict: 'id' },
  );
  if (mediaErr) throw mediaErr;

  const { error: upsertErr } = await supabase.from('photo_tags').upsert(
    {
      family_id: familyId,
      asset_owner_user_id: userId,
      asset_id: assetId,
      tagged_by_user_id: userId,
      tagged_at: nowIso,
      creation_time: creationTime,
      original_width: info.width || null,
      original_height: info.height || null,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      location_fetched_at: location ? nowIso : null,
      upload_status: 'uploading',
      upload_error: null,
      moment_id: momentId,
      moment_media_id: mediaId,
    },
    { onConflict: 'family_id,asset_owner_user_id,asset_id' },
  );
  if (upsertErr) throw upsertErr;

  const reservationId = await reserveMediaUpload({
    familyId,
    mediaType: 'video',
    bytes: sourceBytes || 0,
    durationSec: durationSec || 0,
  });

  try {
    await uploadBuffer(fullPath, info.localUri || info.uri, mimeType);

    let posterObject = null;
    let posterMetadata = {};
    try {
      const poster = await createVideoPoster({ info, match });
      await uploadBuffer(posterPath, poster.uri, 'image/jpeg');
      posterObject = posterId;
      posterMetadata = {
        posterPath,
        posterTimeMs: poster.timeMs,
        posterWidth: poster.width,
        posterHeight: poster.height,
        posterSource: poster.source,
      };
    } catch (posterErr) {
      posterMetadata = {
        posterStatus: 'failed',
        posterError: String(posterErr?.message || posterErr),
      };
    }

    const [tagDone, mediaDone] = await Promise.all([
      supabase
        .from('photo_tags')
        .update({
          storage_object: fullId,
          thumb_object: posterObject,
          upload_status: 'ready',
          upload_error: null,
          moment_id: momentId,
          moment_media_id: mediaId,
        })
        .eq('family_id', familyId)
        .eq('asset_owner_user_id', userId)
        .eq('asset_id', assetId),
      supabase
        .from('moment_media')
        .update({
          poster_object: posterObject,
          metadata: { ...metadata, ...posterMetadata },
          upload_status: 'ready',
          upload_error: null,
          quota_class: 'optimized',
          source_bytes: sourceBytes,
          optimized_bytes: sourceBytes,
          playback_seconds: durationSec ? Math.round(durationSec) : null,
        })
        .eq('id', mediaId),
    ]);
    if (tagDone.error) throw tagDone.error;
    if (mediaDone.error) throw mediaDone.error;

    await finalizeMediaUpload(reservationId, { bytes: sourceBytes, durationSec });
    return { fullId, posterId: posterObject };
  } catch (err) {
    await releaseMediaUpload(reservationId);
    await Promise.all([
      supabase
        .from('photo_tags')
        .update({ upload_status: 'failed', upload_error: String(err?.message || err) })
        .eq('family_id', familyId)
        .eq('asset_owner_user_id', userId)
        .eq('asset_id', assetId),
      supabase
        .from('moment_media')
        .update({ upload_status: 'failed', upload_error: String(err?.message || err) })
        .eq('id', mediaId),
    ]);
    throw err;
  }
}

/**
 * Saves an auto-discovered video as a poster-only memory: poster + metadata
 * now, no source upload. The user can promote it to a playable video later
 * (uploadForTag without videoPosterOnly reuses the same moment/media ids).
 */
async function savePosterOnlyVideoForTag({ familyId, assetId, userId, info, match }) {
  const location = normalizeLocation(info.location);
  const nowIso = new Date().toISOString();
  const creationTime = info.creationTime ? new Date(info.creationTime).toISOString() : null;
  const durationSec = info.duration ? Number(info.duration) / 1000 : null;
  const { data: existingTag, error: existingErr } = await supabase
    .from('photo_tags')
    .select('moment_id, moment_media_id')
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', userId)
    .eq('asset_id', assetId)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const momentId = existingTag?.moment_id || uuid();
  const mediaId = existingTag?.moment_media_id || uuid();
  const posterId = uuid();
  const posterPath = `${familyId}/moments/${momentId}/video-poster/${posterId}.jpg`;

  if (!existingTag?.moment_id) {
    const { error: momentErr } = await supabase.from('moments').insert({
      id: momentId,
      family_id: familyId,
      author_user_id: userId,
      captured_at: creationTime || nowIso,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      shared_with: [],
    });
    if (momentErr) throw momentErr;
  }

  const poster = await createVideoPoster({ info, match });
  await uploadBuffer(posterPath, poster.uri, 'image/jpeg');
  const posterBytes = fileSizeOf(poster.uri);

  const metadata = {
    source: 'scan-auto-save',
    localAssetId: assetId,
    posterPath,
    posterTimeMs: poster.timeMs,
    posterWidth: poster.width,
    posterHeight: poster.height,
    posterSource: poster.source,
    posterOnly: true,
    sourceDurationSec: durationSec,
    originalFileName: info.fileName || match?.fileName || null,
  };

  const { error: mediaErr } = await supabase.from('moment_media').upsert(
    {
      id: mediaId,
      moment_id: momentId,
      family_id: familyId,
      owner_user_id: userId,
      media_type: 'video',
      local_identifier: assetId,
      file_name: info.fileName || match?.fileName || null,
      mime_type: mimeTypeForVideo(extensionForVideo(info)),
      full_object: null,
      poster_object: posterId,
      width: info.width || null,
      height: info.height || null,
      duration_sec: durationSec,
      metadata,
      upload_status: 'ready',
      upload_error: null,
      quota_class: 'poster_only',
      optimized_bytes: posterBytes,
      sort_order: 0,
    },
    { onConflict: 'id' },
  );
  if (mediaErr) throw mediaErr;

  const { error: upsertErr } = await supabase.from('photo_tags').upsert(
    {
      family_id: familyId,
      asset_owner_user_id: userId,
      asset_id: assetId,
      tagged_by_user_id: userId,
      tagged_at: nowIso,
      creation_time: creationTime,
      original_width: info.width || null,
      original_height: info.height || null,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      location_fetched_at: location ? nowIso : null,
      storage_object: null,
      thumb_object: posterId,
      upload_status: 'ready',
      upload_error: null,
      moment_id: momentId,
      moment_media_id: mediaId,
    },
    { onConflict: 'family_id,asset_owner_user_id,asset_id' },
  );
  if (upsertErr) throw upsertErr;

  return { posterId, posterOnly: true };
}

export async function deleteForTag({ familyId, assetOwnerUserId, assetId }) {
  // Look up the tag to find storage objects
  const { data: row, error: selErr } = await supabase
    .from('photo_tags')
    .select('storage_object, thumb_object, moment_id, moment_media_id, moment_media(metadata)')
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', assetOwnerUserId)
    .eq('asset_id', assetId)
    .maybeSingle();
  if (selErr) throw selErr;

  const paths = new Set();
  if (row?.storage_object) paths.add(`${familyId}/full/${row.storage_object}.jpg`);
  if (row?.thumb_object) paths.add(`${familyId}/thumb/${row.thumb_object}.jpg`);
  if (row?.moment_media?.metadata?.fullPath) paths.add(row.moment_media.metadata.fullPath);
  if (row?.moment_media?.metadata?.thumbPath) paths.add(row.moment_media.metadata.thumbPath);
  if (row?.moment_media?.metadata?.posterPath) paths.add(row.moment_media.metadata.posterPath);

  if (paths.size) {
    await supabase.storage.from(BUCKET).remove(Array.from(paths));
    for (const path of paths) signedUrlCache.delete(path);
  }

  if (row?.moment_media_id) {
    const { error: mediaErr } = await supabase
      .from('moment_media')
      .delete()
      .eq('family_id', familyId)
      .eq('id', row.moment_media_id);
    if (mediaErr) throw mediaErr;
  }

  const { error: delErr } = await supabase
    .from('photo_tags')
    .delete()
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', assetOwnerUserId)
    .eq('asset_id', assetId);
  if (delErr) throw delErr;

  if (row?.moment_id) {
    await deleteEmptyMoment({ familyId, momentId: row.moment_id });
  }
}

async function deleteEmptyMoment({ familyId, momentId }) {
  const [{ count: mediaCount, error: mediaErr }, { count: voiceCount, error: voiceErr }] = await Promise.all([
    supabase
      .from('moment_media')
      .select('id', { count: 'exact', head: true })
      .eq('family_id', familyId)
      .eq('moment_id', momentId),
    supabase
      .from('voice_notes')
      .select('id', { count: 'exact', head: true })
      .eq('family_id', familyId)
      .eq('moment_id', momentId),
  ]);
  if (mediaErr || voiceErr) return;
  if ((mediaCount || 0) > 0 || (voiceCount || 0) > 0) return;
  const { error } = await supabase
    .from('moments')
    .delete()
    .eq('family_id', familyId)
    .eq('id', momentId);
  if (error) console.warn('deleteEmptyMoment', error.message);
}

/**
 * Returns the full ready-to-display family timeline (all members' tagged
 * photos), each row including pre-fetched signed URLs for thumb + full.
 *
 * Pages through Supabase in chunks because the JS client's PostgREST
 * connection caps each request at ~1000 rows. We keep paging until we run
 * dry or hit `maxRows` (defaults to 5000 — well past any single family's
 * realistic year of saved photos).
 */
export async function listSharedTagged(familyId, { limit = 5000, pageSize = 1000 } = {}) {
  if (!familyId) return [];

  const all = [];
  let from = 0;
  while (all.length < limit) {
    const to = Math.min(from + pageSize - 1, limit - 1);
    const { data, error } = await supabase
      .from('photo_tags')
      .select(
        'family_id, asset_owner_user_id, asset_id, tagged_by_user_id, tagged_at, creation_time, storage_object, thumb_object, original_width, original_height, latitude, longitude, location_fetched_at, upload_status, moment_id, moment_media_id, moment_media(media_type, metadata)',
      )
      .eq('family_id', familyId)
      .eq('upload_status', 'ready')
      .order('creation_time', { ascending: false, nullsFirst: false })
      .range(from, to);
    if (error) {
      console.warn('listSharedTagged', error.message);
      break;
    }
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  if (!all.length) return [];

  // Batch-sign every URL — Storage caps each `createSignedUrls` call too,
  // so chunk those as well.
  const SIGN_CHUNK = 200;
  const fullPathArr = all.map((r) => pathForTaggedFull(familyId, r)).filter(Boolean);
  const thumbPathArr = all.map((r) => pathForTaggedThumb(familyId, r)).filter(Boolean);

  const fullByPath = new Map();
  const thumbByPath = new Map();
  await Promise.all([
    signInChunks(fullPathArr, SIGN_CHUNK, fullByPath),
    signInChunks(thumbPathArr, SIGN_CHUNK, thumbByPath),
  ]);

  return all.map((r) => ({
    ...r,
    location: normalizeLocation(r),
    media_type: r.moment_media?.media_type || 'image',
    fullUrl: fullByPath.get(pathForTaggedFull(familyId, r)) || null,
    thumbUrl: thumbByPath.get(pathForTaggedThumb(familyId, r)) || null,
  }));
}

function pathForTaggedFull(familyId, row) {
  return row?.moment_media?.metadata?.fullPath
    || (row?.storage_object ? `${familyId}/full/${row.storage_object}.jpg` : null);
}

function pathForTaggedThumb(familyId, row) {
  return row?.moment_media?.metadata?.thumbPath
    || row?.moment_media?.metadata?.posterPath
    || (row?.thumb_object ? `${familyId}/thumb/${row.thumb_object}.jpg` : null);
}

/**
 * Returns the set of asset IDs already saved in Supabase for the given
 * (family, owner). Used by the scanner to skip photos that are already
 * in the timeline so re-scans only do work on new content.
 */
export async function listSavedAssetIds({ familyId, ownerUserId }) {
  if (!familyId || !ownerUserId) return new Set();
  const out = new Set();
  let from = 0;
  const chunk = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('photo_tags')
      .select('asset_id')
      .eq('family_id', familyId)
      .eq('asset_owner_user_id', ownerUserId)
      .in('upload_status', ['ready', 'uploading'])
      .range(from, from + chunk - 1);
    if (error) {
      console.warn('listSavedAssetIds', error.message);
      break;
    }
    const rows = data || [];
    for (const r of rows) if (r.asset_id) out.add(r.asset_id);
    if (rows.length < chunk) break;
    from += chunk;
  }
  return out;
}

export async function getUploadQueueStatus({ familyId }) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId || !familyId) {
    return { total: 0, pending: 0, uploading: 0, failed: 0, lastError: null };
  }

  const { data, error } = await supabase
    .from('photo_tags')
    .select('asset_id, upload_status, upload_error, tagged_at')
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', userId)
    .in('upload_status', ['pending', 'failed', 'uploading'])
    .order('tagged_at', { ascending: false })
    .limit(200);

  if (error) {
    console.warn('getUploadQueueStatus', error.message);
    return { total: 0, pending: 0, uploading: 0, failed: 0, lastError: null };
  }

  const counts = { total: 0, pending: 0, uploading: 0, failed: 0, lastError: null };
  for (const row of data || []) {
    const status = row.upload_status || 'pending';
    if (counts[status] !== undefined) counts[status] += 1;
    counts.total += 1;
    if (!counts.lastError && row.upload_error) counts.lastError = row.upload_error;
  }
  return counts;
}

async function signInChunks(paths, chunkSize, into) {
  for (let i = 0; i < paths.length; i += chunkSize) {
    const slice = paths.slice(i, i + chunkSize);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(slice, SIGNED_URL_TTL_SECONDS);
    if (error) {
      console.warn('createSignedUrls', error.message);
      continue;
    }
    for (const item of data || []) into.set(item.path, item.signedUrl);
  }
}

/**
 * Re-uploads any photo_tags rows owned by the current user on this device
 * whose status is 'pending' or 'failed'. Useful after a network glitch or
 * when a partner tags via the partner-only flow we may add later.
 */
export async function backfillPendingForOwner({ familyId }) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId || !familyId) return { uploaded: 0, skipped: 0 };

  const { data: rows, error } = await supabase
    .from('photo_tags')
    .select('asset_id')
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', userId)
    .in('upload_status', ['pending', 'failed', 'uploading']);
  if (error) {
    console.warn('backfillPendingForOwner', error.message);
    return { uploaded: 0, skipped: 0 };
  }

  let uploaded = 0;
  let skipped = 0;
  for (const r of rows || []) {
    try {
      await uploadForTag({ familyId, assetId: r.asset_id });
      uploaded += 1;
    } catch (err) {
      console.warn('backfill skipped', r.asset_id, err.message);
      skipped += 1;
    }
  }
  return { uploaded, skipped };
}

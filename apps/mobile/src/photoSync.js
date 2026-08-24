import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { getAssetDetails, normalizeMediaLibraryAssetId } from './photos';
import * as mediaDb from './mediaDb';
import { registerReadySavedFileFingerprint } from './savedMediaFingerprint';
import { clearICloudWait, recordICloudWait } from './iCloudRetryQueue';
import { markLocalAssetDeletedMetadata } from './localAssetDeletion';
import { mediaUploadMetadata, sharedPosterProvenance } from './mediaUploadMetadataModel';
import {
  assertVideoWithinPlan,
  fileSizeOf,
  finalizeMediaUpload,
  isMediaPolicyError,
  releaseMediaUpload,
  reserveMediaUpload,
} from './mediaPolicy';
import {
  STREAM_SIMPLE_UPLOAD_MAX_BYTES,
  createStreamUpload,
  getMediaSession,
  streamPlaybackUrl,
  uploadToStream,
} from './mediaSession';
import { uuid } from './moments';
import { supabase } from './supabase';

// SQLite cache calls must never break the network path.
function safeCache(fn) {
  try {
    return fn();
  } catch (err) {
    console.warn('mediaDb', err?.message);
    return undefined;
  }
}

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
const silentRepairAttemptedAt = new Map();
const SILENT_REPAIR_COOLDOWN_MS = 5 * 60 * 1000;

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
export async function uploadForTag({ familyId, assetId, match = null, videoPosterOnly = false, source = null }) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error('Not signed in');
  if (!familyId) throw new Error('No family');

  // The Photos identifier is a private device key. Only the opaque mapping is
  // allowed to cross the shared archive boundary, and it must exist before the
  // first retryable remote write.
  const remoteIdentity = mediaDb.getOrCreateRemoteAssetIdentity({
    familyId,
    ownerUserId: userId,
    localAssetId: assetId,
    proposedRemoteKey: uuid(),
    proposedMomentId: uuid(),
    proposedMediaId: uuid(),
  });
  const { remoteAssetKey } = remoteIdentity;

  const jobId = `${familyId}:${remoteAssetKey}`;
  safeCache(() => mediaDb.enqueueUploadJob({
    id: jobId,
    familyId,
    localAssetId: assetId,
    mediaType: match?.mediaType === 'video' ? 'video' : 'image',
    videoPosterOnly,
  }));

  try {
    const info = await getAssetDetails(assetId, { downloadFromNetwork: true });
    if (!info) throw new Error('Could not load media from library');
    const localUri = info.localUri || info.uri;
    if (!localUri) {
      const message = info.downloadError || 'Could not download this media from iCloud. Try again after it finishes downloading in Photos.';
      await recordICloudWait({
        familyId,
        userId,
        assetIds: [assetId],
        source: 'upload',
        reason: message,
      }).catch(() => {});
      throw new Error(message);
    }
    await clearICloudWait({ familyId, userId, assetIds: [assetId] }).catch(() => {});
    safeCache(() => mediaDb.enqueueUploadJob({
      id: jobId,
      familyId,
      localAssetId: assetId,
      mediaType: info.mediaType === 'video' ? 'video' : 'image',
      videoPosterOnly,
    }));

    let result;
    if (info.mediaType === 'video') {
      result = videoPosterOnly
        ? await savePosterOnlyVideoForTag({ familyId, assetId, remoteIdentity, userId, info, match, source })
        : await uploadVideoForTag({ familyId, assetId, remoteIdentity, userId, info, match, source });
    } else {
      result = await uploadImageForTag({ familyId, assetId, remoteIdentity, userId, info, match, source });
    }
    safeCache(() => mediaDb.markUploadJob(jobId, 'done'));
    return { ...result, remoteAssetKey };
  } catch (err) {
    // Plan rejections are decisions, not retryable failures.
    safeCache(() => mediaDb.markUploadJob(jobId, isMediaPolicyError(err) ? 'done' : 'failed', String(err?.message || err)));
    throw err;
  }
}

async function uploadImageForTag({ familyId, assetId, remoteIdentity, userId, info, match, source }) {
  const { remoteAssetKey, momentId: mappedMomentId, mediaId: mappedMediaId } = remoteIdentity;
  const localUri = info.localUri || info.uri;
  const location = normalizeLocation(info.location);
  const nowIso = new Date().toISOString();
  const creationTime = info.creationTime ? new Date(info.creationTime).toISOString() : null;
  const { data: existingTag, error: existingErr } = await supabase
    .from('photo_tags')
    .select('moment_id, moment_media_id')
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', userId)
    .eq('asset_id', remoteAssetKey)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const momentId = existingTag?.moment_id || mappedMomentId;
  const mediaId = existingTag?.moment_media_id || mappedMediaId;
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
      local_identifier: remoteAssetKey,
      mime_type: 'image/jpeg',
      full_object: fullId,
      thumb_object: thumbId,
      width: info.width || null,
      height: info.height || null,
      metadata: mediaUploadMetadata({
        source: source || 'library-review',
        fullPath,
        thumbPath,
      }, match),
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
      asset_id: remoteAssetKey,
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
  mediaDb.recordRemoteAssetTarget({
    familyId,
    ownerUserId: userId,
    localAssetId: assetId,
    remoteAssetKey,
    momentId,
    mediaId,
  });

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
        .eq('asset_id', remoteAssetKey),
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

    await registerReadySavedFileFingerprint({
      familyId,
      momentId,
      mediaId,
      fileUri: full.uri,
    }).catch(() => null);

    return { fullId, thumbId, momentId, mediaId };
  } catch (err) {
    await releaseMediaUpload(reservationId);
    await Promise.all([
      supabase
        .from('photo_tags')
        .update({ upload_status: 'failed', upload_error: String(err?.message || err) })
        .eq('family_id', familyId)
        .eq('asset_owner_user_id', userId)
        .eq('asset_id', remoteAssetKey),
      supabase
        .from('moment_media')
        .update({ upload_status: 'failed', upload_error: String(err?.message || err) })
        .eq('id', mediaId),
    ]);
    throw err;
  }
}

async function uploadVideoForTag({ familyId, assetId, remoteIdentity, userId, info, match, source }) {
  const { remoteAssetKey, momentId: mappedMomentId, mediaId: mappedMediaId } = remoteIdentity;
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
    .eq('asset_id', remoteAssetKey)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const momentId = existingTag?.moment_id || mappedMomentId;
  const mediaId = existingTag?.moment_media_id || mappedMediaId;
  const fullId = uuid();
  const posterId = uuid();
  const ext = extensionForVideo(info);
  const mimeType = mimeTypeForVideo(ext);
  // New playable videos go to Cloudflare Stream; sources past the simple
  // upload cap stay on the legacy Supabase byte plane until tus lands.
  const useStream = !sourceBytes || sourceBytes <= STREAM_SIMPLE_UPLOAD_MAX_BYTES;
  const fullPath = useStream ? null : `${familyId}/moments/${momentId}/video/${fullId}.${ext}`;
  const posterPath = `${familyId}/moments/${momentId}/video-poster/${posterId}.jpg`;
  const metadata = mediaUploadMetadata({
    source: source || 'library-review',
    ...(fullPath ? { fullPath } : {}),
    posterPath,
    recognitionFrameTimeMs: match?.frameTimeMs ?? null,
    originalFileName: info.fileName || match?.fileName || null,
  }, match);

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
      local_identifier: remoteAssetKey,
      file_name: info.fileName || match?.fileName || null,
      mime_type: mimeType,
      full_object: useStream ? null : fullId,
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
      asset_id: remoteAssetKey,
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
  mediaDb.recordRemoteAssetTarget({
    familyId,
    ownerUserId: userId,
    localAssetId: assetId,
    remoteAssetKey,
    momentId,
    mediaId,
  });

  let reservationId = null;
  let streamUid = null;
  try {
    if (useStream) {
      const upload = await createStreamUpload({ familyId, durationSec, sourceBytes });
      reservationId = upload.reservationId;
      streamUid = upload.uid;
      await uploadToStream({
        uploadURL: upload.uploadURL,
        uri: info.localUri || info.uri,
        fileName: info.fileName || match?.fileName,
        mimeType,
      });
    } else {
      reservationId = await reserveMediaUpload({
        familyId,
        mediaType: 'video',
        bytes: sourceBytes || 0,
        durationSec: durationSec || 0,
      });
      await uploadBuffer(fullPath, info.localUri || info.uri, mimeType);
    }

    let posterObject = null;
    let posterMetadata = {};
    try {
      const poster = await createVideoPoster({ info, match });
      await uploadBuffer(posterPath, poster.uri, 'image/jpeg');
      posterObject = posterId;
      posterMetadata = {
        posterPath,
        posterWidth: poster.width,
        posterHeight: poster.height,
        ...sharedPosterProvenance(poster),
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
          storage_object: useStream ? null : fullId,
          thumb_object: posterObject,
          upload_status: 'ready',
          upload_error: null,
          moment_id: momentId,
          moment_media_id: mediaId,
        })
        .eq('family_id', familyId)
        .eq('asset_owner_user_id', userId)
        .eq('asset_id', remoteAssetKey),
      supabase
        .from('moment_media')
        .update({
          poster_object: posterObject,
          metadata: { ...metadata, ...posterMetadata },
          upload_status: 'ready',
          upload_error: null,
          quota_class: 'optimized',
          storage_provider: useStream ? 'stream' : 'supabase',
          playback_provider: useStream ? 'stream' : 'supabase',
          stream_uid: streamUid,
          source_bytes: sourceBytes,
          optimized_bytes: sourceBytes,
          playback_seconds: durationSec ? Math.round(durationSec) : null,
        })
        .eq('id', mediaId),
    ]);
    if (tagDone.error) throw tagDone.error;
    if (mediaDone.error) throw mediaDone.error;

    await finalizeMediaUpload(reservationId, { bytes: sourceBytes, durationSec });
    await registerReadySavedFileFingerprint({
      familyId,
      momentId,
      mediaId,
      fileUri: info.localUri || info.uri,
    }).catch(() => null);
    return { fullId: useStream ? null : fullId, streamUid, posterId: posterObject, momentId, mediaId };
  } catch (err) {
    await releaseMediaUpload(reservationId);
    await Promise.all([
      supabase
        .from('photo_tags')
        .update({ upload_status: 'failed', upload_error: String(err?.message || err) })
        .eq('family_id', familyId)
        .eq('asset_owner_user_id', userId)
        .eq('asset_id', remoteAssetKey),
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
async function savePosterOnlyVideoForTag({ familyId, assetId, remoteIdentity, userId, info, match, source }) {
  const { remoteAssetKey, momentId: mappedMomentId, mediaId: mappedMediaId } = remoteIdentity;
  const location = normalizeLocation(info.location);
  const nowIso = new Date().toISOString();
  const creationTime = info.creationTime ? new Date(info.creationTime).toISOString() : null;
  const durationSec = info.duration ? Number(info.duration) / 1000 : null;
  const { data: existingTag, error: existingErr } = await supabase
    .from('photo_tags')
    .select('moment_id, moment_media_id')
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', userId)
    .eq('asset_id', remoteAssetKey)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const momentId = existingTag?.moment_id || mappedMomentId;
  const mediaId = existingTag?.moment_media_id || mappedMediaId;
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

  const metadata = mediaUploadMetadata({
    source: source || 'scan-auto-save',
    posterPath,
    posterWidth: poster.width,
    posterHeight: poster.height,
    ...sharedPosterProvenance(poster),
    posterOnly: true,
    sourceDurationSec: durationSec,
    originalFileName: info.fileName || match?.fileName || null,
  }, match);

  const { error: mediaErr } = await supabase.from('moment_media').upsert(
    {
      id: mediaId,
      moment_id: momentId,
      family_id: familyId,
      owner_user_id: userId,
      media_type: 'video',
      local_identifier: remoteAssetKey,
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
      asset_id: remoteAssetKey,
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
  mediaDb.recordRemoteAssetTarget({
    familyId,
    ownerUserId: userId,
    localAssetId: assetId,
    remoteAssetKey,
    momentId,
    mediaId,
  });

  await registerReadySavedFileFingerprint({
    familyId,
    momentId,
    mediaId,
    fileUri: poster.uri,
  }).catch(() => null);

  return { posterId, posterOnly: true, momentId, mediaId };
}

export async function deleteForTag({ familyId, assetOwnerUserId, assetId }) {
  const remoteAssetKey = mediaDb.resolveRemoteAssetKey({
    familyId,
    ownerUserId: assetOwnerUserId,
    localAssetId: assetId,
  }) || assetId;
  // Look up the tag to find storage objects
  const { data: row, error: selErr } = await supabase
    .from('photo_tags')
    .select('storage_object, thumb_object, moment_id, moment_media_id, moment_media(metadata)')
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', assetOwnerUserId)
    .eq('asset_id', remoteAssetKey)
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
    .eq('asset_id', remoteAssetKey);
  if (delErr) throw delErr;

  if (row?.moment_id) {
    await deleteEmptyMoment({ familyId, momentId: row.moment_id });
  }

  safeCache(() => mediaDb.removeCachedMedia({ familyId, assetOwnerUserId, assetId: remoteAssetKey }));
  safeCache(() => mediaDb.removeRemoteAssetMapping({
    familyId,
    ownerUserId: assetOwnerUserId,
    localAssetId: remoteAssetKey === assetId ? null : assetId,
    remoteAssetKey,
  }));
}

/**
 * Retries upload jobs persisted in SQLite ('queued' from an interrupted
 * session or 'failed' with attempts left). Call on app/archive mount.
 */
export async function resumePendingUploadJobs({ familyId }) {
  if (!familyId) return { resumed: 0, failed: 0 };
  const jobs = safeCache(() => mediaDb.listPendingUploadJobs(familyId)) || [];
  let resumed = 0;
  let failed = 0;
  for (const job of jobs) {
    if (!job.local_asset_id) {
      safeCache(() => mediaDb.markUploadJob(job.id, 'done'));
      continue;
    }
    try {
      await uploadForTag({
        familyId,
        assetId: job.local_asset_id,
        videoPosterOnly: job.target_plan_key === 'poster_only',
      });
      resumed += 1;
    } catch (err) {
      failed += 1;
      console.warn('resume upload job failed', err?.message);
    }
  }
  return { resumed, failed };
}

export async function silentlyRepairUploadsForOwner({ familyId, nowMs = Date.now() } = {}) {
  if (!familyId) return { attempted: false, reason: 'missing-family' };
  const previous = Number(silentRepairAttemptedAt.get(familyId) || 0);
  if (nowMs - previous < SILENT_REPAIR_COOLDOWN_MS) {
    return { attempted: false, reason: 'cooldown' };
  }
  silentRepairAttemptedAt.set(familyId, nowMs);

  const local = await resumePendingUploadJobs({ familyId }).catch(() => ({ resumed: 0, failed: 0 }));
  const remote = await backfillPendingForOwner({ familyId }).catch(() => ({ uploaded: 0, skipped: 0 }));
  return {
    attempted: true,
    repaired: Number(local.resumed || 0) + Number(remote.uploaded || 0),
    remaining: Number(local.failed || 0) + Number(remote.skipped || 0),
  };
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

const TAGGED_SELECT = 'family_id, asset_owner_user_id, asset_id, tagged_by_user_id, tagged_at, creation_time, storage_object, thumb_object, original_width, original_height, latitude, longitude, location_fetched_at, upload_status, moment_id, moment_media_id, moment_media(media_type, duration_sec, quota_class, stream_uid, metadata)';

function quoteFilterValue(value) {
  return `"${String(value).replace(/"/g, '')}"`;
}

function normalizeTaggedRow(familyId, row) {
  return {
    ...row,
    location: normalizeLocation(row),
    media_type: row.moment_media?.media_type || 'image',
    fullUrl: row.fullUrl || null,
    thumbUrl: row.thumbUrl || null,
  };
}

/**
 * Keyset-paged family timeline. Orders by creation_time desc with
 * (asset_owner_user_id, asset_id) as the stable tie-breaker; rows without a
 * creation_time come last as their own cursor region. Returns raw rows —
 * call hydrateMediaUrls() to sign only the variant the view needs.
 */
export async function listSharedTaggedPage(familyId, {
  cursor = null,
  limit = 60,
  capturedOnOrAfter = null,
  capturedBefore = null,
} = {}) {
  if (!familyId) return { rows: [], nextCursor: null };
  const dateFiltered = !!(capturedOnOrAfter || capturedBefore);

  let query = supabase
    .from('photo_tags')
    .select(TAGGED_SELECT)
    .eq('family_id', familyId)
    .eq('upload_status', 'ready')
    .order('creation_time', { ascending: false, nullsFirst: false })
    .order('asset_owner_user_id', { ascending: true })
    .order('asset_id', { ascending: true })
    .limit(limit);

  if (capturedOnOrAfter) query = query.gte('creation_time', capturedOnOrAfter);
  if (capturedBefore) query = query.lt('creation_time', capturedBefore);

  if (cursor?.nullRegion) {
    query = query.is('creation_time', null);
    if (cursor.o) {
      query = query.or(
        `asset_owner_user_id.gt.${quoteFilterValue(cursor.o)},and(asset_owner_user_id.eq.${quoteFilterValue(cursor.o)},asset_id.gt.${quoteFilterValue(cursor.a)})`,
      );
    }
  } else {
    query = query.not('creation_time', 'is', null);
    if (cursor?.t) {
      const t = quoteFilterValue(cursor.t);
      const o = quoteFilterValue(cursor.o);
      query = query.or(
        `creation_time.lt.${t},and(creation_time.eq.${t},asset_owner_user_id.gt.${o}),and(creation_time.eq.${t},asset_owner_user_id.eq.${o},asset_id.gt.${quoteFilterValue(cursor.a)})`,
      );
    }
  }

  const { data, error } = await query;
  if (error) {
    console.warn('listSharedTaggedPage', error.message);
    return { rows: [], nextCursor: null };
  }

  const rows = (data || []).map((row) => normalizeTaggedRow(familyId, row));
  const last = rows[rows.length - 1];
  let nextCursor = null;
  if (rows.length === limit && last) {
    nextCursor = cursor?.nullRegion || !last.creation_time
      ? { nullRegion: true, o: last.asset_owner_user_id, a: last.asset_id }
      : { t: last.creation_time, o: last.asset_owner_user_id, a: last.asset_id };
  } else if (!cursor?.nullRegion && !dateFiltered) {
    // Non-null region ran dry — the null-creation_time stragglers come next.
    // Date-filtered reads skip the null region: a null creation_time can't match.
    nextCursor = { nullRegion: true, o: '', a: '' };
  }
  return { rows, nextCursor };
}

/**
 * Signs URLs for only the requested variant:
 *  - 'thumb': grid views — thumbnail or video poster
 *  - 'full':  detail/share/export — display or playback source
 * Rows already hydrated for that variant are left untouched.
 */
export async function hydrateMediaUrls(rows, { variant = 'thumb' } = {}) {
  const list = rows || [];
  if (!list.length) return [];
  const familyId = list[0]?.family_id;
  const wantFull = variant === 'full' || variant === 'all';
  const wantThumb = variant === 'thumb' || variant === 'all';

  // Reuse unexpired signed URLs from the local variant cache first.
  const cachedFor = (r, v) => safeCache(() => mediaDb.getCachedVariantUrl(r.moment_media_id, v)) || null;

  // Stream playback URLs come from the media gateway, not Supabase signing.
  const streamUidOf = (r) => r.stream_uid || r.moment_media?.stream_uid || null;
  let mediaSessionToken = null;
  if (wantFull && list.some((r) => streamUidOf(r))) {
    mediaSessionToken = await getMediaSession(familyId).catch(() => null);
  }

  const fullByPath = new Map();
  const thumbByPath = new Map();
  const jobs = [];
  if (wantFull) {
    const paths = list
      .filter((r) => !r.fullUrl && !streamUidOf(r) && !cachedFor(r, 'full'))
      .map((r) => pathForTaggedFull(r.family_id || familyId, r))
      .filter(Boolean);
    jobs.push(signInChunks(paths, 200, fullByPath));
  }
  if (wantThumb) {
    const paths = list
      .filter((r) => !r.thumbUrl && !cachedFor(r, 'thumb'))
      .map((r) => pathForTaggedThumb(r.family_id || familyId, r))
      .filter(Boolean);
    jobs.push(signInChunks(paths, 200, thumbByPath));
  }
  await Promise.all(jobs);

  return list.map((r) => {
    const streamUid = streamUidOf(r);
    const fullUrl = r.fullUrl
      || (wantFull && streamUid ? streamPlaybackUrl(r.family_id || familyId, streamUid, mediaSessionToken) : null)
      || (wantFull ? cachedFor(r, 'full') || fullByPath.get(pathForTaggedFull(r.family_id || familyId, r)) : null)
      || null;
    const thumbUrl = r.thumbUrl
      || (wantThumb ? cachedFor(r, 'thumb') || thumbByPath.get(pathForTaggedThumb(r.family_id || familyId, r)) : null)
      || null;
    if (r.moment_media_id) {
      // Gateway stream URLs carry a short-lived session token — never cache those.
      if (fullUrl && !r.fullUrl && !streamUid) safeCache(() => mediaDb.setCachedVariantUrl(r.moment_media_id, 'full', fullUrl, SIGNED_URL_TTL_SECONDS));
      if (thumbUrl && !r.thumbUrl) safeCache(() => mediaDb.setCachedVariantUrl(r.moment_media_id, 'thumb', thumbUrl, SIGNED_URL_TTL_SECONDS));
    }
    return { ...r, fullUrl, thumbUrl };
  });
}

/** Signs display/playback + poster URLs for one media item on detail open. */
export async function getMediaDetailUrls(mediaId) {
  if (!mediaId) return null;
  const { data, error } = await supabase
    .from('moment_media')
    .select('id, family_id, media_type, metadata, quota_class')
    .eq('id', mediaId)
    .maybeSingle();
  if (error || !data) return null;
  const metadata = data.metadata || {};
  const paths = [metadata.fullPath, metadata.thumbPath, metadata.posterPath].filter(Boolean);
  const signed = new Map();
  await signInChunks(paths, 200, signed);
  return {
    mediaId: data.id,
    mediaType: data.media_type,
    quotaClass: data.quota_class || 'optimized',
    fullUrl: signed.get(metadata.fullPath) || null,
    thumbUrl: signed.get(metadata.thumbPath) || null,
    posterUrl: signed.get(metadata.posterPath) || null,
  };
}

/**
 * Legacy bounded-list read. Compatibility wrapper over listSharedTaggedPage
 * for the ritual/firsts/library flows that want an in-memory list. Signs
 * thumbnails only unless the caller opts into full URLs. Timeline uses the
 * page API directly.
 */
export async function listSharedTagged(familyId, { limit = 5000, pageSize = 500, variant = 'thumb' } = {}) {
  if (!familyId) return [];
  const all = [];
  let cursor = null;
  while (all.length < limit) {
    const { rows, nextCursor } = await listSharedTaggedPage(familyId, {
      cursor,
      limit: Math.min(pageSize, limit - all.length),
    });
    all.push(...rows);
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return hydrateMediaUrls(all, { variant });
}

export async function listSharedTaggedChronological(familyId, {
  limit = 60,
  capturedOnOrAfter = null,
  capturedBefore = null,
  variant = 'thumb',
} = {}) {
  if (!familyId) return [];
  let query = supabase
    .from('photo_tags')
    .select(TAGGED_SELECT)
    .eq('family_id', familyId)
    .eq('upload_status', 'ready')
    .not('creation_time', 'is', null)
    .order('creation_time', { ascending: true, nullsFirst: false })
    .order('asset_owner_user_id', { ascending: true })
    .order('asset_id', { ascending: true })
    .limit(limit);

  if (capturedOnOrAfter) query = query.gte('creation_time', capturedOnOrAfter);
  if (capturedBefore) query = query.lt('creation_time', capturedBefore);

  const { data, error } = await query;
  if (error) {
    console.warn('listSharedTaggedChronological', error.message);
    return [];
  }

  return hydrateMediaUrls((data || []).map((row) => normalizeTaggedRow(familyId, row)), { variant });
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

export async function markLocalAssetsDeleted({ familyId, ownerUserId, assetIds, deletedAt = new Date().toISOString() }) {
  const ids = uniqueAssetIds(assetIds);
  if (!familyId || !ownerUserId || !ids.length) return { marked: 0 };

  let marked = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100)
      .map((localAssetId) => mediaDb.resolveRemoteAssetKey({ familyId, ownerUserId, localAssetId }))
      .filter(Boolean);
    if (!slice.length) continue;
    const { data, error } = await supabase
      .from('moment_media')
      .select('id, metadata')
      .eq('family_id', familyId)
      .eq('owner_user_id', ownerUserId)
      .in('local_identifier', slice);
    if (error) {
      console.warn('markLocalAssetsDeleted select', error.message);
      continue;
    }

    for (const row of data || []) {
      const metadata = markLocalAssetDeletedMetadata(row.metadata, deletedAt);
      const { error: updateErr } = await supabase
        .from('moment_media')
        .update({ metadata })
        .eq('family_id', familyId)
        .eq('id', row.id);
      if (updateErr) {
        console.warn('markLocalAssetsDeleted update', updateErr.message);
        continue;
      }
      marked += 1;
    }
  }
  return { marked };
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
  return mediaDb.listMappedLocalAssetIds({ familyId, ownerUserId, remoteAssetKeys: Array.from(out) });
}

function uniqueAssetIds(ids) {
  const out = [];
  const seen = new Set();
  for (const value of ids || []) {
    const assetId = normalizeMediaLibraryAssetId(value?.id || value?.assetId || value?.localIdentifier || value);
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);
    out.push(assetId);
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
    const localAssetId = mediaDb.resolveLocalAssetId({
      familyId,
      ownerUserId: userId,
      remoteAssetKey: r.asset_id,
    });
    if (!localAssetId) {
      skipped += 1;
      continue;
    }
    try {
      await uploadForTag({ familyId, assetId: localAssetId });
      uploaded += 1;
    } catch (err) {
      console.warn('backfill skipped', err.message);
      skipped += 1;
    }
  }
  return { uploaded, skipped };
}

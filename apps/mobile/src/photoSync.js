import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { getAssetDetails, normalizeMediaLibraryAssetId } from './photos';
import * as mediaDb from './mediaDb';
import {
  assertCanonicalMediaIdentity,
  canonicalMediaProviderIdentity,
  confirmCanonicalKeepPreparation,
  ensureCanonicalMoment,
  finalizeCanonicalProviderUpload,
  reconcileCanonicalKeepSideEffect,
  resolveCanonicalPosterResult,
  resumeCanonicalProviderUpload,
} from './canonicalMediaKeepModel.js';
import { registerReadySavedFileFingerprint } from './savedMediaFingerprint';
import { clearICloudWait, recordICloudWait } from './iCloudRetryQueue';
import { markLocalAssetDeletedMetadata } from './localAssetDeletion';
import { classifyPosterErrorCode, mediaUploadMetadata } from './mediaUploadMetadataModel';
import {
  assertCanonicalVideoPublication,
  assertLegacyQueuedKeepResolved,
  canonicalizeUploadJob,
  canonicalImageKeepRecovery,
  canonicalPosterKeepComplete,
  canonicalVideoKeepComplete,
  legacyImageRowsMatch,
  legacyDirectVideoRowsMatch,
  legacyPosterVideoRowsMatch,
  legacyRemoteAssetIdentityFromRows,
  reconcileLegacyImageUpload,
  reconcileLegacyDirectVideoUpload,
  reconcileLegacyPosterVideoUpload,
  resumeCanonicalObjectUpload,
} from './mediaUploadRecoveryModel.js';
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
import {
  isMissingPostgrestRelationship,
  readChronologicalPostgrestRelationshipCompatible,
} from './postgrestCompatibility';
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
  const sourceFrame = match?.previewUri || match?.uri;
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

async function prepareVideoPoster({ info, match, posterPath, posterId, required = false }) {
  try {
    const poster = await createVideoPoster({ info, match });
    return {
      ...poster,
      posterPath,
      posterId,
      metadata: {
        posterPath,
        posterTimeMs: poster.timeMs,
        posterWidth: poster.width,
        posterHeight: poster.height,
        posterSource: poster.source,
      },
    };
  } catch (error) {
    console.warn('video poster extraction failed', error?.message || error);
    if (required) throw error;
    return {
      uri: null,
      posterPath,
      posterId,
      metadata: {
        posterStatus: 'failed',
        posterErrorCode: classifyPosterErrorCode(error),
      },
    };
  }
}

async function uploadPreparedVideoPoster(poster) {
  if (!poster?.uri) return { posterObject: null, posterMetadata: poster?.metadata || {} };
  try {
    await uploadBuffer(poster.posterPath, poster.uri, 'image/jpeg');
    return { posterObject: poster.posterId, posterMetadata: poster.metadata || {} };
  } catch (error) {
    console.warn('video poster upload failed', error?.message || error);
    return {
      posterObject: null,
      posterMetadata: {
        posterStatus: 'failed',
        posterErrorCode: classifyPosterErrorCode(error),
      },
    };
  }
}

async function uploadVideoPoster({ info, match, posterPath, posterId }) {
  const poster = await prepareVideoPoster({ info, match, posterPath, posterId });
  return uploadPreparedVideoPoster(poster);
}

async function publishVideoReadyRows({
  familyId,
  userId,
  remoteAssetKey,
  momentId,
  mediaId,
  fullId,
  streamUid,
  sourceBytes,
  optimizedBytes = sourceBytes,
  durationSec,
  metadata,
  posterResult,
  storageProvider,
  quotaClass,
}) {
  const posterObject = posterResult?.posterObject || null;
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
      .eq('asset_id', remoteAssetKey)
      .select('family_id, asset_owner_user_id, asset_id, moment_id, moment_media_id, upload_status')
      .maybeSingle(),
    supabase
      .from('moment_media')
      .update({
        full_object: fullId,
        poster_object: posterObject,
        metadata: mediaUploadMetadata({
          ...metadata,
          ...(posterResult?.posterMetadata || {}),
        }),
        upload_status: 'ready',
        upload_error: null,
        quota_class: quotaClass,
        storage_provider: storageProvider,
        playback_provider: streamUid ? 'stream' : storageProvider,
        stream_uid: streamUid,
        source_bytes: sourceBytes,
        optimized_bytes: optimizedBytes,
        playback_seconds: durationSec ? Math.round(durationSec) : null,
      })
      .eq('id', mediaId)
      .eq('family_id', familyId)
      .eq('owner_user_id', userId)
      .select('id, family_id, owner_user_id, moment_id, upload_status')
      .maybeSingle(),
  ]);
  if (tagDone.error) throw tagDone.error;
  if (mediaDone.error) throw mediaDone.error;
  assertCanonicalVideoPublication({
    tagRow: tagDone.data,
    mediaRow: mediaDone.data,
    familyId,
    ownerUserId: userId,
    remoteAssetKey,
    momentId,
    mediaId,
  });
}

async function prepareCanonicalKeep({ familyId, userId, remoteIdentity, capturedAt, location }) {
  const { data: existingTag, error: existingTagError } = await supabase
    .from('photo_tags')
    .select('moment_id, moment_media_id, storage_object, thumb_object, original_width, original_height, upload_status')
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', userId)
    .eq('asset_id', remoteIdentity.remoteAssetKey)
    .maybeSingle();
  if (existingTagError) throw existingTagError;

  const momentId = existingTag?.moment_id || remoteIdentity.momentId;
  const mediaId = existingTag?.moment_media_id || remoteIdentity.mediaId;
  const expectedMoment = {
    id: momentId,
    family_id: familyId,
    author_user_id: userId,
    captured_at: capturedAt,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    shared_with: [],
  };
  await ensureCanonicalMoment({
    expected: expectedMoment,
    read: async (id) => {
      const { data, error } = await supabase
        .from('moments')
        .select('id, family_id, author_user_id')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    insert: async (moment) => {
      const { error } = await supabase.from('moments').insert(moment);
      if (error) throw error;
    },
  });

  const { data: existingMedia, error: existingMediaError } = await supabase
    .from('moment_media')
    .select('id, moment_id, family_id, owner_user_id, local_identifier, media_type, full_object, thumb_object, poster_object, stream_uid, width, height, upload_status, metadata, storage_provider, source_bytes, optimized_bytes, playback_seconds')
    .eq('id', mediaId)
    .maybeSingle();
  if (existingMediaError) throw existingMediaError;
  assertCanonicalMediaIdentity(existingMedia, {
    id: mediaId,
    moment_id: momentId,
    family_id: familyId,
    owner_user_id: userId,
    local_identifier: remoteIdentity.remoteAssetKey,
  });
  return {
    existingTag,
    existingMedia,
    momentId,
    mediaId,
    providerIdentity: canonicalMediaProviderIdentity({ mediaId, existingMedia, existingTag }),
  };
}

export async function reconcileCanonicalKeepSideEffects({ familyId, ownerUserId, assetId }) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData?.user?.id;
  if (!userId || userId !== ownerUserId) throw new Error('Canonical Keep reconciliation is not authorized');
  if (!familyId || !assetId) throw new Error('Canonical Keep reconciliation scope is incomplete');

  const identity = mediaDb.getRemoteAssetIdentity({
    familyId,
    ownerUserId,
    localAssetId: assetId,
  });
  if (!identity) return false;
  if (identity.canonicalSideEffectStarted) return true;

  const readOne = async (query) => {
    const { data, error } = await query;
    if (error) throw error;
    return data || null;
  };
  const readReservation = async () => {
    if (!identity.providerUpload?.reservationId && !identity.mediaId) return null;
    let query = supabase
      .from('media_upload_reservations')
      .select('id, status, provider, provider_object_id, canonical_media_id, transport')
      .eq('family_id', familyId)
      .eq('user_id', userId)
      .in('status', ['reserved', 'finalized']);
    query = identity.providerUpload?.reservationId
      ? query.eq('id', identity.providerUpload.reservationId)
      : query.eq('canonical_media_id', identity.mediaId);
    const { data, error } = await query.limit(1);
    if (error) throw error;
    return data?.[0] || null;
  };

  return reconcileCanonicalKeepSideEffect({
    readMoment: () => identity.momentId
      ? readOne(supabase
        .from('moments')
        .select('id')
        .eq('id', identity.momentId)
        .eq('family_id', familyId)
        .eq('author_user_id', userId)
        .maybeSingle())
      : null,
    readMedia: () => identity.mediaId
      ? readOne(supabase
        .from('moment_media')
        .select('id')
        .eq('id', identity.mediaId)
        .eq('family_id', familyId)
        .eq('owner_user_id', userId)
        .maybeSingle())
      : null,
    readTag: () => identity.remoteAssetKey
      ? readOne(supabase
        .from('photo_tags')
        .select('moment_id, moment_media_id')
        .eq('family_id', familyId)
        .eq('asset_owner_user_id', userId)
        .eq('asset_id', identity.remoteAssetKey)
        .maybeSingle())
      : null,
    readReservation,
    markStarted: (evidence) => {
      if (identity.remoteAssetKey && (evidence.tag?.moment_id || evidence.tag?.moment_media_id)) {
        mediaDb.recordRemoteAssetTarget({
          familyId,
          ownerUserId: userId,
          localAssetId: assetId,
          remoteAssetKey: identity.remoteAssetKey,
          momentId: evidence.tag?.moment_id || identity.momentId,
          mediaId: evidence.tag?.moment_media_id || identity.mediaId,
        });
      }
      mediaDb.recordCanonicalSideEffectStarted({
        familyId,
        ownerUserId: userId,
        localAssetId: assetId,
      });
    },
  });
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
  const existingIdentity = mediaDb.getRemoteAssetIdentity({
    familyId,
    ownerUserId: userId,
    localAssetId: assetId,
  });
  const sourceJob = mediaDb.getPendingUploadJob({ familyId, localAssetId: assetId });
  let legacyIdentity = null;
  try {
    legacyIdentity = !existingIdentity && sourceJob
      ? await readLegacyKeptRemoteAssetIdentity({ familyId, userId, localAssetId: assetId })
      : null;
    assertLegacyQueuedKeepResolved({ sourceJob, existingIdentity, legacyIdentity });
  } catch (error) {
    safeCache(() => mediaDb.markUploadJob(sourceJob?.id, 'failed', String(error?.message || error)));
    throw error;
  }
  const remoteIdentity = mediaDb.getOrCreateRemoteAssetIdentity({
    familyId,
    ownerUserId: userId,
    localAssetId: assetId,
    proposedRemoteKey: legacyIdentity?.remoteAssetKey || uuid(),
    proposedMomentId: legacyIdentity?.momentId || uuid(),
    proposedMediaId: legacyIdentity?.mediaId || uuid(),
  });
  const { remoteAssetKey } = remoteIdentity;

  const jobId = `${familyId}:${remoteAssetKey}`;
  await canonicalizeUploadJob({
    sourceJob,
    canonicalJobId: jobId,
    rekey: ({ sourceJobId, canonicalJobId }) => mediaDb.rekeyUploadJob({
      sourceJobId,
      canonicalJobId,
      familyId,
      localAssetId: assetId,
    }),
  });
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

async function readLegacyKeptRemoteAssetIdentity({ familyId, userId, localAssetId }) {
  const pageSize = 500;
  const tags = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('photo_tags')
      .select('family_id, asset_owner_user_id, asset_id, moment_id, moment_media_id, upload_status')
      .eq('family_id', familyId)
      .eq('asset_owner_user_id', userId)
      .order('asset_id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    tags.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }
  const matchingTags = tags.filter((row) => row?.asset_id === localAssetId);
  if (matchingTags.length !== 1 || !matchingTags[0]?.moment_media_id) return null;
  const { data: media, error: mediaError } = await supabase
    .from('moment_media')
    .select('id, moment_id, family_id, owner_user_id, local_identifier, upload_status')
    .eq('id', matchingTags[0].moment_media_id)
    .eq('family_id', familyId)
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (mediaError) throw mediaError;
  return legacyRemoteAssetIdentityFromRows({
    familyId,
    ownerUserId: userId,
    localAssetId,
    tags: matchingTags,
    media,
  });
}

async function uploadImageForTag({ familyId, assetId, remoteIdentity, userId, info, match, source }) {
  const { remoteAssetKey, momentId: mappedMomentId, mediaId: mappedMediaId } = remoteIdentity;
  const localUri = info.localUri || info.uri;
  const location = normalizeLocation(info.location);
  const nowIso = new Date().toISOString();
  const creationTime = info.creationTime ? new Date(info.creationTime).toISOString() : null;
  const canonical = await confirmCanonicalKeepPreparation({
    prepare: () => prepareCanonicalKeep({
      familyId,
      userId,
      remoteIdentity: { ...remoteIdentity, momentId: mappedMomentId, mediaId: mappedMediaId },
      capturedAt: creationTime || nowIso,
      location,
    }),
    markStarted: () => mediaDb.recordCanonicalSideEffectStarted({
      familyId,
      ownerUserId: userId,
      localAssetId: assetId,
    }),
  });
  const { momentId, mediaId, existingMedia, existingTag } = canonical;
  const fullId = canonical.providerIdentity.fullObjectId;
  const thumbId = canonical.providerIdentity.thumbObjectId;
  const fullPath = `${familyId}/full/${fullId}.jpg`;
  const thumbPath = `${familyId}/thumb/${thumbId}.jpg`;
  mediaDb.recordRemoteAssetTarget({
    familyId,
    ownerUserId: userId,
    localAssetId: assetId,
    remoteAssetKey,
    momentId,
    mediaId,
  });

  const recovery = canonicalImageKeepRecovery({
    existingMedia,
    existingTag,
    momentId,
    mediaId,
    fullObjectId: fullId,
    thumbObjectId: thumbId,
  });
  if (recovery.complete) {
    await resumeCanonicalObjectUpload({ complete: true });
    return { fullId, thumbId, momentId, mediaId };
  }

  const persistTransfer = async (next) => mediaDb.recordRemoteProviderUpload({
    familyId,
    ownerUserId: userId,
    localAssetId: assetId,
    providerUpload: next,
  });
  let transferContext = remoteIdentity.providerUpload;
  if (!transferContext && legacyImageRowsMatch({
    existingMedia,
    existingTag,
    momentId,
    mediaId,
    fullObjectId: fullId,
    thumbObjectId: thumbId,
  })) {
    transferContext = await reconcileLegacyImageUpload({
      existingMedia,
      existingTag,
      momentId,
      mediaId,
      fullObjectId: fullId,
      thumbObjectId: thumbId,
      readReservation: async () => {
        const { data, error } = await supabase.rpc('reconcile_legacy_canonical_image_upload', {
          target_family_id: familyId,
          p_canonical_media_id: mediaId,
          p_full_storage_path: fullPath,
          p_thumb_storage_path: thumbPath,
        });
        if (error) throw error;
        return (Array.isArray(data) ? data[0] : data) || null;
      },
      persist: persistTransfer,
    });
  }

  let full = null;
  let thumb = null;
  if (recovery.remoteReady) {
    await resumeCanonicalObjectUpload({ complete: true });
  } else {
    let fullBuf = null;
    let thumbBuf = null;
    if (transferContext?.state !== 'finalized') {
      full = await resize(localUri, FULL_MAX_DIM, FULL_QUALITY);
      thumb = await resize(full.uri, THUMB_MAX_DIM, THUMB_QUALITY);
      [fullBuf, thumbBuf] = await Promise.all([
        readAsArrayBuffer(full.uri),
        readAsArrayBuffer(thumb.uri),
      ]);
    }
    const derivativeBytes = (fullBuf?.byteLength || 0) + (thumbBuf?.byteLength || 0);
    await resumeCanonicalObjectUpload({
      context: transferContext,
      reserve: () => reserveMediaUpload({
        familyId,
        mediaType: 'image',
        bytes: derivativeBytes,
        canonicalMediaId: mediaId,
        transport: 'image',
        required: true,
      }),
      persist: persistTransfer,
      upload: async () => {
        if (!fullBuf || !thumbBuf) throw new Error('Canonical image upload source is unavailable');
        const opts = { contentType: 'image/jpeg', upsert: true };
        const [fullRes, thumbRes] = await Promise.all([
          supabase.storage.from(BUCKET).upload(fullPath, fullBuf, opts),
          supabase.storage.from(BUCKET).upload(thumbPath, thumbBuf, opts),
        ]);
        if (fullRes.error) throw fullRes.error;
        if (thumbRes.error) throw thumbRes.error;
      },
      finalize: (current) => finalizeMediaUpload(current.reservationId, { bytes: derivativeBytes }),
      abandon: releaseMediaUpload,
    });
  }

  const width = full?.width || existingMedia?.width || existingTag?.original_width || info.width || null;
  const height = full?.height || existingMedia?.height || existingTag?.original_height || info.height || null;
  const metadata = mediaUploadMetadata(
    recovery.remoteReady && existingMedia?.metadata
      ? existingMedia.metadata
      : {
          source: source || 'library-review',
          fullPath,
          thumbPath,
        },
    recovery.remoteReady && existingMedia?.metadata ? null : match,
  );
  const [mediaReady, tagReady] = await Promise.all([
    supabase.from('moment_media').upsert({
      id: mediaId,
      moment_id: momentId,
      family_id: familyId,
      owner_user_id: userId,
      media_type: 'image',
      local_identifier: remoteAssetKey,
      mime_type: 'image/jpeg',
      full_object: fullId,
      thumb_object: thumbId,
      width,
      height,
      metadata,
      upload_status: 'ready',
      upload_error: null,
      sort_order: 0,
    }, { onConflict: 'id' }),
    supabase.from('photo_tags').upsert({
      family_id: familyId,
      asset_owner_user_id: userId,
      asset_id: remoteAssetKey,
      tagged_by_user_id: userId,
      tagged_at: nowIso,
      creation_time: creationTime,
      original_width: width,
      original_height: height,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      location_fetched_at: nowIso,
      storage_object: fullId,
      thumb_object: thumbId,
      upload_status: 'ready',
      upload_error: null,
      moment_id: momentId,
      moment_media_id: mediaId,
    }, { onConflict: 'family_id,asset_owner_user_id,asset_id' }),
  ]);
  if (mediaReady.error) throw mediaReady.error;
  if (tagReady.error) throw tagReady.error;

  if (full?.uri) {
    await registerReadySavedFileFingerprint({
      familyId,
      momentId,
      mediaId,
      fileUri: full.uri,
    }).catch(() => null);
  }

  return { fullId, thumbId, momentId, mediaId };
}

async function uploadVideoForTag({ familyId, assetId, remoteIdentity, userId, info, match, source }) {
  const { remoteAssetKey, momentId: mappedMomentId, mediaId: mappedMediaId } = remoteIdentity;
  const durationSec = info.duration ? Number(info.duration) / 1000 : null;
  const sourceBytes = fileSizeOf(info.localUri || info.uri);

  const location = normalizeLocation(info.location);
  const nowIso = new Date().toISOString();
  const creationTime = info.creationTime ? new Date(info.creationTime).toISOString() : null;
  const canonical = await confirmCanonicalKeepPreparation({
    prepare: () => prepareCanonicalKeep({
      familyId,
      userId,
      remoteIdentity: { ...remoteIdentity, momentId: mappedMomentId, mediaId: mappedMediaId },
      capturedAt: creationTime || nowIso,
      location,
    }),
    markStarted: () => mediaDb.recordCanonicalSideEffectStarted({
      familyId,
      ownerUserId: userId,
      localAssetId: assetId,
    }),
  });
  const { momentId, mediaId, existingMedia } = canonical;
  const fullId = canonical.providerIdentity.fullObjectId;
  const posterId = canonical.providerIdentity.posterObjectId;
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
    originalFileName: info.fileName || match?.fileName || null,
  }, match);
  let streamUid = existingMedia?.stream_uid || remoteIdentity.providerUpload?.uid || null;
  let providerContext = remoteIdentity.providerUpload
    || (existingMedia?.stream_uid ? { uid: existingMedia.stream_uid, state: 'uploaded' } : null);
  const persistTransfer = (next) => mediaDb.recordRemoteProviderUpload({
    familyId,
    ownerUserId: userId,
    localAssetId: assetId,
    providerUpload: next,
  });
  if (!useStream && !providerContext && legacyDirectVideoRowsMatch({
    existingMedia,
    existingTag: canonical.existingTag,
    momentId,
    mediaId,
    fullObjectId: fullId,
  })) {
    let storageObjectPresent = false;
    providerContext = await reconcileLegacyDirectVideoUpload({
      context: providerContext,
      existingMedia,
      existingTag: canonical.existingTag,
      momentId,
      mediaId,
      fullObjectId: fullId,
      sourceBytes,
      durationSec,
      readReservation: async () => {
        const { data, error } = await supabase.rpc('reconcile_legacy_canonical_media_upload', {
          target_family_id: familyId,
          p_canonical_media_id: mediaId,
          p_transport: 'video-direct',
          p_storage_path: fullPath,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        storageObjectPresent = !!row?.storage_present;
        return row || null;
      },
      hasStorageObject: async () => storageObjectPresent,
      persist: persistTransfer,
    });
  }
  const providerPublished = remoteIdentity.providerUpload?.state === 'published'
    && remoteIdentity.providerUpload.uid === existingMedia?.stream_uid;
  const directPublished = providerContext?.kind === 'video-direct'
    && providerContext.state === 'published';

  if (canonicalVideoKeepComplete({
    existingMedia,
    existingTag: canonical.existingTag,
    momentId,
    mediaId,
    requireStream: useStream,
    providerPublished: useStream ? providerPublished : directPublished,
  })) {
    return {
      fullId: useStream ? null : fullId,
      streamUid: existingMedia.stream_uid || null,
      posterId: existingMedia.poster_object || null,
      momentId,
      mediaId,
    };
  }

  await assertVideoWithinPlan({ familyId, durationSec, sourceBytes });

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
      poster_object: posterId,
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

  try {
    const publish = (current) => publishVideoReadyRows({
      familyId,
      userId,
      remoteAssetKey,
      momentId,
      mediaId,
      fullId: useStream ? null : fullId,
      streamUid: useStream ? current.uid : null,
      sourceBytes,
      durationSec,
      metadata,
      posterResult: current.result,
      storageProvider: useStream ? 'stream' : 'supabase',
      quotaClass: 'optimized',
    });

    if (useStream) {
      providerContext = await resumeCanonicalProviderUpload({
        context: providerContext,
        prepare: (current) => createStreamUpload({
          familyId,
          mediaId,
          durationSec,
          sourceBytes,
          context: current,
        }),
        persist: persistTransfer,
        upload: (prepared) => uploadToStream({
          uploadURL: prepared.uploadURL,
          uri: info.localUri || info.uri,
          fileName: info.fileName || match?.fileName,
          mimeType,
        }),
      });
      streamUid = providerContext.uid;
      const posterResult = await resolveCanonicalPosterResult({
        contextResult: providerContext.result,
        existingMedia,
        existingTag: canonical.existingTag,
        upload: () => uploadVideoPoster({ info, match, posterPath, posterId }),
      });
      providerContext = await finalizeCanonicalProviderUpload({
        context: { ...providerContext, result: posterResult },
        finalize: (current) => finalizeMediaUpload(current.reservationId, { bytes: sourceBytes, durationSec }),
        persist: persistTransfer,
        publish,
      });
    } else {
      const poster = await prepareVideoPoster({ info, match, posterPath, posterId });
      providerContext = await resumeCanonicalObjectUpload({
        kind: 'video-direct',
        context: providerContext,
        reserve: () => reserveMediaUpload({
          familyId,
          mediaType: 'video',
          bytes: sourceBytes || 0,
          durationSec: durationSec || 0,
          canonicalMediaId: mediaId,
          transport: 'video-direct',
          required: true,
        }),
        persist: persistTransfer,
        upload: async () => {
          await uploadBuffer(fullPath, info.localUri || info.uri, mimeType);
          return uploadPreparedVideoPoster(poster);
        },
        finalize: (current) => finalizeMediaUpload(current.reservationId, { bytes: sourceBytes, durationSec }),
        publish,
        abandon: releaseMediaUpload,
      });
    }
    await registerReadySavedFileFingerprint({
      familyId,
      momentId,
      mediaId,
      fileUri: info.localUri || info.uri,
    }).catch(() => null);
    return {
      fullId: useStream ? null : fullId,
      streamUid,
      posterId: providerContext?.result?.posterObject || null,
      momentId,
      mediaId,
    };
  } catch (err) {
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
  const canonical = await confirmCanonicalKeepPreparation({
    prepare: () => prepareCanonicalKeep({
      familyId,
      userId,
      remoteIdentity: { ...remoteIdentity, momentId: mappedMomentId, mediaId: mappedMediaId },
      capturedAt: creationTime || nowIso,
      location,
    }),
    markStarted: () => mediaDb.recordCanonicalSideEffectStarted({
      familyId,
      ownerUserId: userId,
      localAssetId: assetId,
    }),
  });
  const { momentId, mediaId } = canonical;
  const posterId = canonical.providerIdentity.posterObjectId;
  const posterPath = `${familyId}/moments/${momentId}/video-poster/${posterId}.jpg`;
  const persistTransfer = (next) => mediaDb.recordRemoteProviderUpload({
    familyId,
    ownerUserId: userId,
    localAssetId: assetId,
    providerUpload: next,
  });
  let transferContext = remoteIdentity.providerUpload;
  if (!transferContext && legacyPosterVideoRowsMatch({
    existingMedia: canonical.existingMedia,
    existingTag: canonical.existingTag,
    momentId,
    mediaId,
    posterObjectId: posterId,
  })) {
    transferContext = await reconcileLegacyPosterVideoUpload({
      context: transferContext,
      existingMedia: canonical.existingMedia,
      existingTag: canonical.existingTag,
      momentId,
      mediaId,
      posterObjectId: posterId,
      readReservation: async () => {
        const { data, error } = await supabase.rpc('reconcile_legacy_canonical_media_upload', {
          target_family_id: familyId,
          p_canonical_media_id: mediaId,
          p_transport: 'video-poster',
          p_storage_path: posterPath,
        });
        if (error) throw error;
        return (Array.isArray(data) ? data[0] : data) || null;
      },
      persist: persistTransfer,
    });
  }

  if (canonicalPosterKeepComplete({
    existingMedia: canonical.existingMedia,
    existingTag: canonical.existingTag,
    momentId,
    mediaId,
    transferPublished: transferContext?.kind === 'video-poster'
      && transferContext.state === 'published',
  })) {
    return { posterId: canonical.existingMedia.poster_object, posterOnly: true, momentId, mediaId };
  }

  const poster = await prepareVideoPoster({ info, match, posterPath, posterId, required: true });
  const posterBytes = fileSizeOf(poster.uri);

  const metadata = mediaUploadMetadata({
    source: source || 'scan-auto-save',
    posterPath,
    posterTimeMs: poster.timeMs,
    posterWidth: poster.width,
    posterHeight: poster.height,
    posterSource: poster.source,
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
      upload_status: 'uploading',
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
      thumb_object: null,
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

  const transfer = await resumeCanonicalObjectUpload({
    kind: 'video-poster',
    context: transferContext,
    reserve: () => reserveMediaUpload({
      familyId,
      mediaType: 'image',
      bytes: posterBytes || 0,
      canonicalMediaId: mediaId,
      transport: 'video-poster',
      required: true,
    }),
    persist: persistTransfer,
    upload: async () => {
      const result = await uploadPreparedVideoPoster(poster);
      if (!result.posterObject) throw new Error('Video poster could not be saved');
      return result;
    },
    finalize: (current) => finalizeMediaUpload(current.reservationId, { bytes: posterBytes }),
    publish: (current) => publishVideoReadyRows({
      familyId,
      userId,
      remoteAssetKey,
      momentId,
      mediaId,
      fullId: null,
      streamUid: null,
      sourceBytes: null,
      durationSec,
      metadata,
      posterResult: current.result,
      storageProvider: 'supabase',
      quotaClass: 'poster_only',
      optimizedBytes: posterBytes,
    }),
    abandon: releaseMediaUpload,
  });

  await registerReadySavedFileFingerprint({
    familyId,
    momentId,
    mediaId,
    fileUri: poster.uri,
  }).catch(() => null);

  return { posterId: transfer.result?.posterObject || posterId, posterOnly: true, momentId, mediaId };
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
    .select('storage_object, thumb_object, moment_id, moment_media_id, moment_media:moment_media!photo_tags_media_family_fkey(metadata)')
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

const TAGGED_SELECT = 'family_id, asset_owner_user_id, asset_id, tagged_by_user_id, tagged_at, creation_time, storage_object, thumb_object, original_width, original_height, latitude, longitude, location_fetched_at, upload_status, moment_id, moment_media_id, moment_media:moment_media!photo_tags_media_family_fkey(media_type, duration_sec, quota_class, stream_uid, metadata)';
const TAGGED_BASE_SELECT = 'family_id, asset_owner_user_id, asset_id, tagged_by_user_id, tagged_at, creation_time, storage_object, thumb_object, original_width, original_height, latitude, longitude, location_fetched_at, upload_status, moment_id, moment_media_id';

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

  let { data, error } = await buildTaggedPageQuery({
    familyId,
    select: TAGGED_SELECT,
    cursor,
    limit,
    capturedOnOrAfter,
    capturedBefore,
  });
  if (error && isMissingPostgrestRelationship(error)) {
    ({ data, error } = await buildTaggedPageQuery({
      familyId,
      select: TAGGED_BASE_SELECT,
      cursor,
      limit,
      capturedOnOrAfter,
      capturedBefore,
    }));
    if (!error) {
      try {
        data = await attachTaggedMediaWithoutEmbed(familyId, data || []);
      } catch (attachError) {
        error = attachError;
      }
    }
  }
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

function buildTaggedPageQuery({
  familyId,
  select,
  cursor,
  limit,
  capturedOnOrAfter,
  capturedBefore,
}) {
  let query = supabase
    .from('photo_tags')
    .select(select)
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

  return query;
}

async function attachTaggedMediaWithoutEmbed(familyId, rows) {
  const ids = [...new Set((rows || []).map((row) => row.moment_media_id).filter(Boolean))];
  if (!ids.length) return rows;
  const { data, error } = await supabase
    .from('moment_media')
    .select('id, media_type, duration_sec, quota_class, stream_uid, metadata')
    .eq('family_id', familyId)
    .in('id', ids);
  if (error) throw error;
  const byId = new Map((data || []).map((media) => [media.id, media]));
  return (rows || []).map((row) => ({
    ...row,
    moment_media: byId.get(row.moment_media_id) || null,
  }));
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
  try {
    const data = await readChronologicalPostgrestRelationshipCompatible({
      familyId,
      embeddedSelect: TAGGED_SELECT,
      baseSelect: TAGGED_BASE_SELECT,
      createQuery: (select) => supabase.from('photo_tags').select(select),
      attachRelations: attachTaggedMediaWithoutEmbed,
      limit,
      capturedOnOrAfter,
      capturedBefore,
    });
    return hydrateMediaUrls(data.map((row) => normalizeTaggedRow(familyId, row)), { variant });
  } catch (error) {
    console.warn('listSharedTaggedChronological', error?.message);
    return [];
  }
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

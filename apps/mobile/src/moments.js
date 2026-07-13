import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';

import {
  assertVideoWithinPlan,
  fileSizeOf,
  finalizeMediaUpload,
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
import { attachmentTarget } from './mediaAttachmentTarget';
import { supabase } from './supabase';
import { normalizeMomentTags } from './tagModel';

const BUCKET = 'family-photos';
const FULL_MAX_DIM = 1800;
const THUMB_MAX_DIM = 640;
const VIDEO_POSTER_MAX_DIM = 960;
const FULL_QUALITY = 0.86;
const THUMB_QUALITY = 0.74;
const VIDEO_POSTER_QUALITY = 0.8;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/webm': 'webm',
};

export function uuid() {
  const r = (n) => {
    const buf = [];
    for (let i = 0; i < n; i += 1) buf.push(((Math.random() * 16) | 0).toString(16));
    return buf.join('');
  };
  return `${r(8)}-${r(4)}-4${r(3)}-${(8 + ((Math.random() * 4) | 0)).toString(16)}${r(3)}-${r(12)}`;
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error('Not signed in');
  return data.user.id;
}

async function readAsArrayBuffer(uri) {
  return new File(uri).arrayBuffer();
}

function extensionFor({ mimeType, fileName, fallback }) {
  if (mimeType && MIME_EXT[String(mimeType).toLowerCase()]) {
    return MIME_EXT[String(mimeType).toLowerCase()];
  }
  const ext = String(fileName || '').split('.').pop()?.toLowerCase();
  if (ext && /^[a-z0-9]{2,5}$/.test(ext)) return ext;
  return fallback;
}

function mediaTypeFor(asset) {
  if (asset?.type === 'video' || String(asset?.mimeType || '').startsWith('video/')) return 'video';
  return 'image';
}

function resizeAction(width, height, maxDim) {
  if (width && height && height > width) return { resize: { height: maxDim } };
  return { resize: { width: maxDim } };
}

async function resizeImage(uri, width, height, maxDim, compress) {
  return ImageManipulator.manipulateAsync(
    uri,
    [resizeAction(width, height, maxDim)],
    { compress, format: ImageManipulator.SaveFormat.JPEG },
  );
}

async function uploadBuffer(path, uri, contentType) {
  const body = await readAsArrayBuffer(uri);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType, upsert: true });
  if (error) throw error;
}

function posterTimeFor(asset) {
  const durationMs = Number(asset?.duration || 0);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1000;
  return Math.max(500, Math.min(3000, Math.round(durationMs * 0.08)));
}

async function createVideoPoster(asset) {
  const timeMs = posterTimeFor(asset);
  const frame = await VideoThumbnails.getThumbnailAsync(asset.uri, {
    time: timeMs,
    quality: 0.9,
  });
  const poster = await resizeImage(
    frame.uri,
    frame.width || asset.width,
    frame.height || asset.height,
    VIDEO_POSTER_MAX_DIM,
    VIDEO_POSTER_QUALITY,
  );
  return {
    uri: poster.uri,
    width: poster.width || frame.width || null,
    height: poster.height || frame.height || null,
    timeMs,
  };
}

function dateFromAsset(asset) {
  const raw = asset?.creationTime || asset?.createdAt || asset?.metadata?.creationTime;
  if (!raw) return null;
  const ms = Number(raw);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeCapturedAtOverride(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function locationFromAsset(asset) {
  const exif = asset?.exif || {};
  const latitude = Number(exif.GPSLatitude ?? exif.latitude ?? asset?.latitude);
  const longitude = Number(exif.GPSLongitude ?? exif.longitude ?? asset?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

async function uploadPickedImage({ familyId, momentId = null, letterId = null, userId, asset, index, capturedAt }) {
  const target = attachmentTarget({ familyId, momentId, letterId });
  const mediaId = uuid();
  const fullId = uuid();
  const thumbId = uuid();
  const fullPath = `${target.basePath}/image-full/${fullId}.jpg`;
  const thumbPath = `${target.basePath}/image-thumb/${thumbId}.jpg`;
  const localIdentifier = asset.assetId || `picked:${target.id}:${index}`;
  const location = locationFromAsset(asset);
  const creationTime = dateFromAsset(asset) || capturedAt;

  const metadata = {
    source: 'manual-picker',
    pickerAssetId: asset.assetId || null,
    fullPath,
    thumbPath,
    originalFileName: asset.fileName || null,
    fileSize: asset.fileSize || null,
  };

  const { error: insertErr } = await supabase.from('moment_media').insert({
    id: mediaId,
    ...target.columns,
    family_id: familyId,
    owner_user_id: userId,
    media_type: 'image',
    local_identifier: localIdentifier,
    file_name: asset.fileName || null,
    mime_type: 'image/jpeg',
    full_object: fullId,
    thumb_object: thumbId,
    width: asset.width || null,
    height: asset.height || null,
    metadata,
    upload_status: 'uploading',
    sort_order: index,
  });
  if (insertErr) throw insertErr;

  let reservationId = null;
  try {
    const full = await resizeImage(asset.uri, asset.width, asset.height, FULL_MAX_DIM, FULL_QUALITY);
    const thumb = await resizeImage(full.uri, full.width, full.height, THUMB_MAX_DIM, THUMB_QUALITY);
    const derivativeBytes = (fileSizeOf(full.uri) || 0) + (fileSizeOf(thumb.uri) || 0);
    reservationId = await reserveMediaUpload({ familyId, mediaType: 'image', bytes: derivativeBytes });
    await Promise.all([
      uploadBuffer(fullPath, full.uri, 'image/jpeg'),
      uploadBuffer(thumbPath, thumb.uri, 'image/jpeg'),
    ]);
    await finalizeMediaUpload(reservationId, { bytes: derivativeBytes });
    reservationId = null;

    const { error: updateErr } = await supabase
      .from('moment_media')
      .update({
        width: full.width || asset.width || null,
        height: full.height || asset.height || null,
        upload_status: 'ready',
        upload_error: null,
      })
      .eq('id', mediaId);
    if (updateErr) throw updateErr;

    if (momentId) {
      const { error: tagErr } = await supabase.from('photo_tags').upsert(
        {
          family_id: familyId,
          asset_owner_user_id: userId,
          asset_id: localIdentifier,
          tagged_by_user_id: userId,
          tagged_at: new Date().toISOString(),
          creation_time: creationTime,
          original_width: full.width || asset.width || null,
          original_height: full.height || asset.height || null,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          location_fetched_at: location ? new Date().toISOString() : null,
          storage_object: fullId,
          thumb_object: thumbId,
          upload_status: 'ready',
          upload_error: null,
          moment_id: momentId,
          moment_media_id: mediaId,
        },
        { onConflict: 'family_id,asset_owner_user_id,asset_id' },
      );
      if (tagErr) throw tagErr;
    }

    return { id: mediaId, type: 'image', fullPath, thumbPath };
  } catch (err) {
    await releaseMediaUpload(reservationId);
    await supabase
      .from('moment_media')
      .update({ upload_status: 'failed', upload_error: String(err?.message || err) })
      .eq('id', mediaId);
    throw err;
  }
}

async function uploadPickedVideo({ familyId, momentId = null, letterId = null, userId, asset, index }) {
  const target = attachmentTarget({ familyId, momentId, letterId });
  const mediaId = uuid();
  const fullId = uuid();
  const posterId = uuid();
  const ext = extensionFor({ mimeType: asset.mimeType, fileName: asset.fileName, fallback: 'mp4' });
  const mimeType = asset.mimeType || (ext === 'mov' ? 'video/quicktime' : 'video/mp4');
  const posterPath = `${target.basePath}/video-poster/${posterId}.jpg`;
  const localIdentifier = asset.assetId || `picked:${target.id}:${index}`;
  const durationSec = asset.duration ? Number(asset.duration) / 1000 : null;
  const sourceBytes = asset.fileSize || fileSizeOf(asset.uri);

  // New playable videos go to Cloudflare Stream; sources past the simple
  // upload cap stay on the legacy Supabase byte plane until tus lands.
  const useStream = !sourceBytes || sourceBytes <= STREAM_SIMPLE_UPLOAD_MAX_BYTES;
  const fullPath = useStream ? null : `${target.basePath}/video/${fullId}.${ext}`;

  const metadata = {
    source: 'manual-picker',
    pickerAssetId: asset.assetId || null,
    ...(fullPath ? { fullPath } : {}),
    originalFileName: asset.fileName || null,
    fileSize: asset.fileSize || null,
  };

  const { error: insertErr } = await supabase.from('moment_media').insert({
    id: mediaId,
    ...target.columns,
    family_id: familyId,
    owner_user_id: userId,
    media_type: 'video',
    local_identifier: localIdentifier,
    file_name: asset.fileName || null,
    mime_type: mimeType,
    full_object: useStream ? null : fullId,
    width: asset.width || null,
    height: asset.height || null,
    duration_sec: durationSec,
    metadata,
    upload_status: 'uploading',
    sort_order: index,
  });
  if (insertErr) throw insertErr;

  let reservationId = null;
  let streamUid = null;
  try {
    if (useStream) {
      const upload = await createStreamUpload({ familyId, durationSec, sourceBytes });
      reservationId = upload.reservationId;
      streamUid = upload.uid;
      await uploadToStream({
        uploadURL: upload.uploadURL,
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType,
      });
    } else {
      reservationId = await reserveMediaUpload({
        familyId,
        mediaType: 'video',
        bytes: sourceBytes || 0,
        durationSec: durationSec || 0,
      });
      await uploadBuffer(fullPath, asset.uri, mimeType);
    }

    let posterMetadata = {};
    let posterObject = null;
    try {
      const poster = await createVideoPoster(asset);
      await uploadBuffer(posterPath, poster.uri, 'image/jpeg');
      posterObject = posterId;
      posterMetadata = {
        posterPath,
        posterTimeMs: poster.timeMs,
        posterWidth: poster.width,
        posterHeight: poster.height,
      };
    } catch (posterErr) {
      console.warn('video poster extraction failed', posterErr?.message || posterErr);
      posterMetadata = {
        posterStatus: 'failed',
        posterError: String(posterErr?.message || posterErr),
      };
    }
    const { error: updateErr } = await supabase
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
      .eq('id', mediaId);
    if (updateErr) throw updateErr;
    await finalizeMediaUpload(reservationId, { bytes: sourceBytes, durationSec });
    return { id: mediaId, type: 'video', streamUid, posterPath: posterMetadata.posterPath || null };
  } catch (err) {
    await releaseMediaUpload(reservationId);
    await supabase
      .from('moment_media')
      .update({ upload_status: 'failed', upload_error: String(err?.message || err) })
      .eq('id', mediaId);
    throw err;
  }
}

/**
 * Saves a picked video as a poster-only memory (no source upload). Used when
 * a video is over the plan's playable limits and the user keeps the poster.
 */
async function uploadPickedVideoPosterOnly({ familyId, momentId = null, letterId = null, userId, asset, index }) {
  const target = attachmentTarget({ familyId, momentId, letterId });
  const mediaId = uuid();
  const posterId = uuid();
  const posterPath = `${target.basePath}/video-poster/${posterId}.jpg`;
  const localIdentifier = asset.assetId || `picked:${target.id}:${index}`;
  const durationSec = asset.duration ? Number(asset.duration) / 1000 : null;

  const poster = await createVideoPoster(asset);

  const metadata = {
    source: 'manual-picker',
    pickerAssetId: asset.assetId || null,
    posterPath,
    posterTimeMs: poster.timeMs,
    posterWidth: poster.width,
    posterHeight: poster.height,
    posterOnly: true,
    sourceDurationSec: durationSec,
    originalFileName: asset.fileName || null,
    fileSize: asset.fileSize || null,
  };

  const { error: insertErr } = await supabase.from('moment_media').insert({
    id: mediaId,
    ...target.columns,
    family_id: familyId,
    owner_user_id: userId,
    media_type: 'video',
    local_identifier: localIdentifier,
    file_name: asset.fileName || null,
    mime_type: asset.mimeType || 'video/mp4',
    poster_object: posterId,
    width: asset.width || null,
    height: asset.height || null,
    duration_sec: durationSec,
    metadata,
    upload_status: 'uploading',
    quota_class: 'poster_only',
    sort_order: index,
  });
  if (insertErr) throw insertErr;

  try {
    await uploadBuffer(posterPath, poster.uri, 'image/jpeg');
    const { error: updateErr } = await supabase
      .from('moment_media')
      .update({
        upload_status: 'ready',
        upload_error: null,
        optimized_bytes: fileSizeOf(poster.uri),
      })
      .eq('id', mediaId);
    if (updateErr) throw updateErr;
    return { id: mediaId, type: 'video', posterPath, posterOnly: true };
  } catch (err) {
    await supabase
      .from('moment_media')
      .update({ upload_status: 'failed', upload_error: String(err?.message || err) })
      .eq('id', mediaId);
    throw err;
  }
}

async function uploadVoiceNote({ familyId, momentId = null, letterId = null, userId, voice }) {
  if (!voice?.uri) return null;
  const target = attachmentTarget({ familyId, momentId, letterId });
  const noteId = uuid();
  const audioId = uuid();
  const ext = extensionFor({ mimeType: voice.mimeType, fileName: voice.fileName, fallback: 'm4a' });
  const mimeType = voice.mimeType || 'audio/mp4';
  const audioPath = `${target.basePath}/voice/${audioId}.${ext}`;

  const { error: insertErr } = await supabase.from('voice_notes').insert({
    id: noteId,
    family_id: familyId,
    ...target.columns,
    author_user_id: userId,
    duration_sec: voice.durationSec || null,
    waveform: voice.waveform || [],
    audio_object: audioId,
    mime_type: mimeType,
    upload_status: 'uploading',
  });
  if (insertErr) throw insertErr;

  try {
    await uploadBuffer(audioPath, voice.uri, mimeType);
    const { error: updateErr } = await supabase
      .from('voice_notes')
      .update({
        upload_status: 'ready',
        upload_error: null,
        waveform: voice.waveform || [],
      })
      .eq('id', noteId);
    if (updateErr) throw updateErr;
    return { id: noteId, audioPath };
  } catch (err) {
    await supabase
      .from('voice_notes')
      .update({ upload_status: 'failed', upload_error: String(err?.message || err) })
      .eq('id', noteId);
    throw err;
  }
}

export async function createMomentWithMedia({
  familyId,
  title,
  note,
  placeName,
  tags,
  assets = [],
  voice = null,
  videoPosterOnly = false,
  capturedAt: capturedAtOverride = null,
}) {
  if (!familyId) throw new Error('No family selected');
  const cleanTitle = String(title || '').trim();
  const cleanNote = String(note || '').trim();
  const cleanPlace = String(placeName || '').trim();
  const cleanTags = normalizeMomentTags(tags);
  const pickedAssets = Array.isArray(assets) ? assets.filter((asset) => asset?.uri) : [];

  if (!cleanTitle && !cleanNote && !pickedAssets.length && !voice?.uri) {
    throw new Error('Add a note, photo, video, or voice note first');
  }

  // Enforce video plan limits before anything is created, so an over-limit
  // video leaves nothing half-saved and the caller can offer poster-only.
  if (!videoPosterOnly) {
    for (const asset of pickedAssets) {
      if (mediaTypeFor(asset) !== 'video') continue;
      await assertVideoWithinPlan({
        familyId,
        durationSec: asset.duration ? Number(asset.duration) / 1000 : null,
        sourceBytes: asset.fileSize || fileSizeOf(asset.uri),
      });
    }
  }

  const userId = await currentUserId();
  const momentId = uuid();
  const capturedAt = normalizeCapturedAtOverride(capturedAtOverride) || dateFromAsset(pickedAssets[0]) || new Date().toISOString();
  const firstLocation = pickedAssets.map(locationFromAsset).find(Boolean);

  const { error: momentErr } = await supabase.from('moments').insert({
    id: momentId,
    family_id: familyId,
    author_user_id: userId,
    title: cleanTitle || null,
    caption_note: cleanNote || null,
    captured_at: capturedAt,
    place_name: cleanPlace || null,
    latitude: firstLocation?.latitude ?? null,
    longitude: firstLocation?.longitude ?? null,
    shared_with: [],
  });
  if (momentErr) throw momentErr;

  const uploadedMedia = [];
  for (let i = 0; i < pickedAssets.length; i += 1) {
    const asset = pickedAssets[i];
    const media = mediaTypeFor(asset) === 'video'
      ? (videoPosterOnly
        ? await uploadPickedVideoPosterOnly({ familyId, momentId, userId, asset, index: i })
        : await uploadPickedVideo({ familyId, momentId, userId, asset, index: i }))
      : await uploadPickedImage({ familyId, momentId, userId, asset, index: i, capturedAt });
    uploadedMedia.push(media);
  }

  if (cleanTags.length) {
    const { error: tagsErr } = await supabase.from('moment_tags').insert(
      cleanTags.map((tag) => ({
        family_id: familyId,
        moment_id: momentId,
        tag,
      })),
    );
    if (tagsErr) throw tagsErr;
  }

  const uploadedVoice = await uploadVoiceNote({ familyId, momentId, userId, voice });

  return {
    id: momentId,
    capturedAt,
    media: uploadedMedia,
    voice: uploadedVoice,
  };
}

export async function uploadLetterAttachments({
  familyId,
  letterId,
  assets = [],
  voice = null,
  videoPosterOnly = false,
}) {
  if (!familyId || !letterId) throw new Error('Missing letter attachment target');
  const pickedAssets = Array.isArray(assets) ? assets.filter((asset) => asset?.uri) : [];

  if (!videoPosterOnly) {
    for (const asset of pickedAssets) {
      if (mediaTypeFor(asset) !== 'video') continue;
      await assertVideoWithinPlan({
        familyId,
        durationSec: asset.duration ? Number(asset.duration) / 1000 : null,
        sourceBytes: asset.fileSize || fileSizeOf(asset.uri),
      });
    }
  }

  const userId = await currentUserId();
  const uploadedMedia = [];
  for (let i = 0; i < pickedAssets.length; i += 1) {
    const asset = pickedAssets[i];
    const media = mediaTypeFor(asset) === 'video'
      ? (videoPosterOnly
        ? await uploadPickedVideoPosterOnly({ familyId, letterId, userId, asset, index: i })
        : await uploadPickedVideo({ familyId, letterId, userId, asset, index: i }))
      : await uploadPickedImage({ familyId, letterId, userId, asset, index: i });
    uploadedMedia.push(media);
  }

  const uploadedVoice = await uploadVoiceNote({ familyId, letterId, userId, voice });
  return { media: uploadedMedia, voice: uploadedVoice };
}

async function signPaths(paths) {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (!unique.length) return new Map();
  const out = new Map();
  for (let i = 0; i < unique.length; i += 200) {
    const slice = unique.slice(i, i + 200);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(slice, SIGNED_URL_TTL_SECONDS);
    if (error) {
      console.warn('moment createSignedUrls', error.message);
      continue;
    }
    for (const row of data || []) out.set(row.path, row.signedUrl);
  }
  return out;
}

export async function getLetterAttachments({ familyId, letterId }) {
  if (!familyId || !letterId) return { media: [], voiceNotes: [] };
  const [mediaResult, voiceResult] = await Promise.all([
    supabase
      .from('moment_media')
      .select('*')
      .eq('family_id', familyId)
      .eq('letter_id', letterId)
      .eq('upload_status', 'ready')
      .order('sort_order', { ascending: true }),
    supabase
      .from('voice_notes')
      .select('*')
      .eq('family_id', familyId)
      .eq('letter_id', letterId)
      .eq('upload_status', 'ready')
      .order('created_at', { ascending: true }),
  ]);
  if (mediaResult.error) throw mediaResult.error;
  if (voiceResult.error) throw voiceResult.error;

  const media = mediaResult.data || [];
  const voiceNotes = voiceResult.data || [];
  const paths = [];
  let hasStreamMedia = false;
  for (const item of media) {
    paths.push(item.metadata?.fullPath, item.metadata?.thumbPath, item.metadata?.posterPath);
    if (item.stream_uid) hasStreamMedia = true;
  }
  for (const voice of voiceNotes) {
    const ext = extensionFor({ mimeType: voice.mime_type, fallback: 'm4a' });
    if (voice.audio_object) paths.push(`${familyId}/letters/${letterId}/voice/${voice.audio_object}.${ext}`);
  }

  const [signed, mediaSessionToken] = await Promise.all([
    signPaths(paths),
    hasStreamMedia ? getMediaSession(familyId).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    media: media.map((item) => ({
      ...item,
      fullUrl: item.stream_uid
        ? streamPlaybackUrl(familyId, item.stream_uid, mediaSessionToken)
        : signed.get(item.metadata?.fullPath) || null,
      thumbUrl: signed.get(item.metadata?.thumbPath) || null,
      posterUrl: signed.get(item.metadata?.posterPath) || null,
    })),
    voiceNotes: voiceNotes.map((voice) => {
      const ext = extensionFor({ mimeType: voice.mime_type, fallback: 'm4a' });
      const audioPath = voice.audio_object
        ? `${familyId}/letters/${letterId}/voice/${voice.audio_object}.${ext}`
        : null;
      return { ...voice, audioUrl: signed.get(audioPath) || null };
    }),
  };
}

export async function deleteLetterAttachments({ familyId, letterId }) {
  if (!familyId || !letterId) return;
  const attachments = await getLetterAttachments({ familyId, letterId });
  const paths = [];
  for (const media of attachments.media) {
    paths.push(media.metadata?.fullPath, media.metadata?.thumbPath, media.metadata?.posterPath);
  }
  for (const voice of attachments.voiceNotes) {
    const ext = extensionFor({ mimeType: voice.mime_type, fallback: 'm4a' });
    if (voice.audio_object) paths.push(`${familyId}/letters/${letterId}/voice/${voice.audio_object}.${ext}`);
  }
  const storagePaths = Array.from(new Set(paths.filter(Boolean)));
  if (storagePaths.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(storagePaths);
    if (error) console.warn('deleteLetterAttachments storage cleanup', error.message);
  }
}

export async function listMomentArchive(familyId, { limit = 120 } = {}) {
  if (!familyId) return [];
  const { data, error } = await supabase
    .from('moments')
    .select(`
      id,
      family_id,
      author_user_id,
      title,
      caption_note,
      captured_at,
      place_name,
      latitude,
      longitude,
      shared_with,
      created_at,
      moment_media (
        id,
        media_type,
        local_identifier,
        owner_user_id,
        file_name,
        mime_type,
        width,
        height,
        duration_sec,
        metadata,
        upload_status,
        quota_class,
        storage_provider,
        playback_provider,
        stream_uid,
        sort_order
      ),
      voice_notes (
        id,
        duration_sec,
        waveform,
        audio_object,
        mime_type,
        upload_status
      ),
      moment_tags (tag),
      moment_reactions (emoji, author_user_id)
    `)
    .eq('family_id', familyId)
    .order('captured_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('listMomentArchive', error.message);
    return [];
  }

  return hydrateMomentRows(familyId, data || []);
}

export async function getMomentDetail({ familyId, momentId }) {
  if (!familyId || !momentId) return null;
  const { data, error } = await supabase
    .from('moments')
    .select(`
      id,
      family_id,
      author_user_id,
      title,
      caption_note,
      captured_at,
      place_name,
      latitude,
      longitude,
      shared_with,
      created_at,
      moment_media (
        id,
        media_type,
        local_identifier,
        owner_user_id,
        file_name,
        mime_type,
        width,
        height,
        duration_sec,
        metadata,
        upload_status,
        quota_class,
        storage_provider,
        playback_provider,
        stream_uid,
        sort_order
      ),
      voice_notes (
        id,
        duration_sec,
        waveform,
        audio_object,
        mime_type,
        upload_status
      ),
      moment_tags (tag),
      moment_reactions (emoji, author_user_id)
    `)
    .eq('family_id', familyId)
    .eq('id', momentId)
    .maybeSingle();
  if (error) {
    console.warn('getMomentDetail', error.message);
    return null;
  }
  const hydrated = await hydrateMomentRows(familyId, data ? [data] : []);
  return hydrated[0] || null;
}

export async function toggleMomentReaction({ familyId, momentId, emoji }) {
  const userId = await currentUserId();
  if (!familyId || !momentId || !emoji) throw new Error('Missing reaction target');
  const { data: existing, error: findErr } = await supabase
    .from('moment_reactions')
    .select('id')
    .eq('family_id', familyId)
    .eq('moment_id', momentId)
    .eq('author_user_id', userId)
    .eq('emoji', emoji)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing?.id) {
    const { error } = await supabase.from('moment_reactions').delete().eq('id', existing.id);
    if (error) throw error;
    return { active: false };
  }
  const { error } = await supabase.from('moment_reactions').insert({
    family_id: familyId,
    moment_id: momentId,
    author_user_id: userId,
    emoji,
  });
  if (error) throw error;
  return { active: true };
}

export async function updateMoment({ familyId, momentId, patch = {}, tags }) {
  if (!familyId || !momentId) throw new Error('Missing moment');
  const payload = {};
  if (patch.title !== undefined) payload.title = String(patch.title || '').trim() || null;
  if (patch.captionNote !== undefined) payload.caption_note = String(patch.captionNote || '').trim() || null;
  if (patch.placeName !== undefined) payload.place_name = String(patch.placeName || '').trim() || null;
  if (patch.capturedAt !== undefined) {
    const capturedAt = normalizeCapturedAtOverride(patch.capturedAt);
    if (capturedAt) payload.captured_at = capturedAt;
  }
  if (patch.sharedWith !== undefined) payload.shared_with = Array.isArray(patch.sharedWith) ? patch.sharedWith : [];
  if (Object.keys(payload).length) {
    payload.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from('moments')
      .update(payload)
      .eq('family_id', familyId)
      .eq('id', momentId);
    if (error) throw error;
  }

  if (tags !== undefined) {
    const cleanTags = normalizeMomentTags(tags);
    const { error: deleteErr } = await supabase
      .from('moment_tags')
      .delete()
      .eq('family_id', familyId)
      .eq('moment_id', momentId);
    if (deleteErr) throw deleteErr;
    if (cleanTags.length) {
      const { error: insertErr } = await supabase.from('moment_tags').insert(
        cleanTags.map((tag) => ({ family_id: familyId, moment_id: momentId, tag })),
      );
      if (insertErr) throw insertErr;
    }
  }
}

export async function setMomentSharedWith({ familyId, momentId, sharedWith }) {
  await updateMoment({ familyId, momentId, patch: { sharedWith } });
}

export async function deleteVoiceNote({ familyId, momentId, voiceNoteId }) {
  if (!familyId || !momentId || !voiceNoteId) throw new Error('Missing voice note');
  const { data: voice, error: findErr } = await supabase
    .from('voice_notes')
    .select('id, audio_object, mime_type')
    .eq('family_id', familyId)
    .eq('moment_id', momentId)
    .eq('id', voiceNoteId)
    .maybeSingle();
  if (findErr) throw findErr;
  if (!voice?.id) return;

  const ext = extensionFor({ mimeType: voice.mime_type, fallback: 'm4a' });
  const audioPath = voice.audio_object ? `${familyId}/moments/${momentId}/voice/${voice.audio_object}.${ext}` : null;
  if (audioPath) {
    const { error: storageErr } = await supabase.storage.from(BUCKET).remove([audioPath]);
    if (storageErr) console.warn('deleteVoiceNote storage cleanup', storageErr.message);
  }
  const { error } = await supabase
    .from('voice_notes')
    .delete()
    .eq('family_id', familyId)
    .eq('moment_id', momentId)
    .eq('id', voiceNoteId);
  if (error) throw error;
}

export async function deleteMoment({ familyId, momentId }) {
  if (!familyId || !momentId) throw new Error('Missing moment');
  const detail = await getMomentDetail({ familyId, momentId });
  const paths = [];
  for (const media of detail?.media || []) {
    paths.push(media.metadata?.fullPath, media.metadata?.thumbPath, media.metadata?.posterPath);
  }
  for (const voice of detail?.voiceNotes || []) {
    const ext = extensionFor({ mimeType: voice.mime_type, fallback: 'm4a' });
    if (voice.audio_object) paths.push(`${familyId}/moments/${momentId}/voice/${voice.audio_object}.${ext}`);
  }
  const storagePaths = Array.from(new Set(paths.filter(Boolean)));
  if (storagePaths.length) {
    const { error: storageErr } = await supabase.storage.from(BUCKET).remove(storagePaths);
    if (storageErr) console.warn('deleteMoment storage cleanup', storageErr.message);
  }
  const { error: tagErr } = await supabase
    .from('photo_tags')
    .delete()
    .eq('family_id', familyId)
    .eq('moment_id', momentId);
  if (tagErr) throw tagErr;
  const { error } = await supabase
    .from('moments')
    .delete()
    .eq('family_id', familyId)
    .eq('id', momentId);
  if (error) throw error;
}

async function hydrateMomentRows(familyId, rows) {
  const paths = [];
  let hasStreamMedia = false;
  for (const moment of rows || []) {
    for (const media of moment.moment_media || []) {
      paths.push(media.metadata?.fullPath, media.metadata?.thumbPath, media.metadata?.posterPath);
      if (media.stream_uid) hasStreamMedia = true;
    }
    for (const voice of moment.voice_notes || []) {
      const ext = extensionFor({ mimeType: voice.mime_type, fallback: 'm4a' });
      if (voice.audio_object) paths.push(`${familyId}/moments/${moment.id}/voice/${voice.audio_object}.${ext}`);
    }
  }
  const [signed, mediaSessionToken] = await Promise.all([
    signPaths(paths),
    hasStreamMedia ? getMediaSession(familyId).catch(() => null) : Promise.resolve(null),
  ]);

  return (rows || []).map((moment) => ({
    ...moment,
    tags: (moment.moment_tags || []).map((row) => row.tag),
    reactions: moment.moment_reactions || [],
    media: (moment.moment_media || [])
      .slice()
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((media) => ({
        ...media,
        fullUrl: media.stream_uid
          ? streamPlaybackUrl(familyId, media.stream_uid, mediaSessionToken)
          : signed.get(media.metadata?.fullPath) || null,
        thumbUrl: signed.get(media.metadata?.thumbPath) || null,
        posterUrl: signed.get(media.metadata?.posterPath) || null,
      })),
    voiceNotes: (moment.voice_notes || []).map((voice) => {
      const ext = extensionFor({ mimeType: voice.mime_type, fallback: 'm4a' });
      const audioPath = voice.audio_object ? `${familyId}/moments/${moment.id}/voice/${voice.audio_object}.${ext}` : null;
      return {
        ...voice,
        audioUrl: signed.get(audioPath) || null,
      };
    }),
  }));
}

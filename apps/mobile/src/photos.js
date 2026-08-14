import {
  Asset,
  AssetField,
  MediaType,
  Query,
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Platform } from 'react-native';

import {
  assetConstructorIdentifier,
  normalizeMediaLibraryAssetId,
  uriForNativeVision,
} from './photoAssetIdentifierModel.js';
import { readMediaLibraryAssetDetails } from './photoAssetDetailsModel.js';

export { ageAt, formatAge } from './ageModel.js';
export {
  assetConstructorIdentifier,
  normalizeMediaLibraryAssetId,
  uriForNativeVision,
} from './photoAssetIdentifierModel.js';

/**
 * Helpers that talk to the photo library on behalf of Our Little World.
 * All expo-media-library access goes through this module (SDK 56 Query + Asset API).
 */

const DESC_CREATION = { key: AssetField.CREATION_TIME, ascending: false };
const ASC_CREATION = { key: AssetField.CREATION_TIME, ascending: true };
const VIDEO_FRAME_SAMPLE_LIMIT = 3;

function mediaQuery(mediaType, createdAfterMs, createdBeforeMs, { ascending = false } = {}) {
  let q = new Query()
    .eq(AssetField.MEDIA_TYPE, mediaType)
    .orderBy(ascending ? ASC_CREATION : DESC_CREATION);
  if (createdAfterMs != null && Number.isFinite(createdAfterMs)) {
    q = q.gte(AssetField.CREATION_TIME, createdAfterMs);
  }
  if (createdBeforeMs != null && Number.isFinite(createdBeforeMs)) {
    q = q.lt(AssetField.CREATION_TIME, createdBeforeMs);
  }
  return q;
}

function imageQuery(createdAfterMs, createdBeforeMs, options) {
  return mediaQuery(MediaType.IMAGE, createdAfterMs, createdBeforeMs, options);
}

function videoQuery(createdAfterMs, createdBeforeMs, options) {
  return mediaQuery(MediaType.VIDEO, createdAfterMs, createdBeforeMs, options);
}

async function mapAssetToLegacy(asset) {
  const [creationTime, width, height] = await Promise.all([
    asset.getCreationTime(),
    asset.getWidth().catch(() => 0),
    asset.getHeight().catch(() => 0),
  ]);
  return {
    id: asset.id,
    mediaType: 'image',
    uri: uriForNativeVision(asset.id),
    localUri: uriForNativeVision(asset.id),
    creationTime: creationTime ?? 0,
    width: width || 0,
    height: height || 0,
  };
}

async function mapAssetToVideo(asset) {
  let uriError = null;
  const [uri, creationTime, duration, width, height, fileName] = await Promise.all([
    asset.getUri().catch((err) => {
      uriError = err;
      return null;
    }),
    asset.getCreationTime(),
    asset.getDuration().catch(() => null),
    asset.getWidth().catch(() => 0),
    asset.getHeight().catch(() => 0),
    asset.getFilename().catch(() => null),
  ]);
  return {
    id: normalizeMediaLibraryAssetId(asset.id),
    mediaType: 'video',
    uri,
    localUri: uri,
    downloadStatus: uri ? 'ready' : 'pending',
    downloadError: uriError ? String(uriError?.message || uriError) : null,
    creationTime: creationTime ?? 0,
    duration: duration ?? null,
    width: width || 0,
    height: height || 0,
    fileName,
  };
}

function cloudWaitCandidate(asset, mediaType = 'image') {
  const sourceAssetId = normalizeMediaLibraryAssetId(asset?.sourceAssetId || asset?.id || asset?.assetId);
  if (!sourceAssetId) return null;
  return {
    id: sourceAssetId,
    candidateId: `${sourceAssetId}#icloud-wait`,
    sourceAssetId,
    mediaType,
    uri: null,
    localUri: null,
    previewUri: null,
    creationTime: asset?.creationTime ?? 0,
    duration: asset?.duration ?? null,
    width: asset?.width || 0,
    height: asset?.height || 0,
    fileName: asset?.fileName || null,
    downloadStatus: asset?.downloadStatus || 'pending',
    downloadError: asset?.downloadError || 'Waiting for the original to download from iCloud.',
    cloudWaitOnly: true,
  };
}

export async function mapAssetForScan(asset) {
  const [creationTime] = await Promise.all([asset.getCreationTime()]);
  return {
    assetId: asset.id,
    localUri: uriForNativeVision(asset.id),
    creationTime: creationTime ?? 0,
  };
}

export async function getLibraryPermissionStatus() {
  const perm = await getPermissionsAsync();
  return {
    granted: perm.status === 'granted',
    accessPrivileges: perm.accessPrivileges,
    canAskAgain: perm.canAskAgain !== false,
  };
}

export async function ensureLibraryPermission() {
  const current = await getPermissionsAsync();
  if (current.status === 'granted') {
    return { granted: true, accessPrivileges: current.accessPrivileges };
  }
  if (!current.canAskAgain) {
    return { granted: false, canAskAgain: false };
  }
  const next = await requestPermissionsAsync();
  return {
    granted: next.status === 'granted',
    accessPrivileges: next.accessPrivileges,
    canAskAgain: next.canAskAgain,
  };
}

/**
 * Fetch a page of photos sorted newest first.
 * `after` is an opaque offset string (legacy cursor compatibility).
 */
export async function fetchPhotosPage({
  after,
  pageSize = 60,
  createdAfterMs,
  createdBeforeMs,
  sortAscending = false,
} = {}) {
  const offset = after != null && after !== '' ? parseInt(String(after), 10) : 0;
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  const rows = await imageQuery(createdAfterMs, createdBeforeMs, { ascending: sortAscending }).limit(pageSize).offset(safeOffset).exe();
  const assets = await Promise.all(rows.map(mapAssetToLegacy));
  return {
    assets,
    endCursor: String(safeOffset + rows.length),
    hasNextPage: rows.length === pageSize,
  };
}

function frameSampleTimes(durationMs) {
  const duration = Number(durationMs || 0);
  if (!Number.isFinite(duration) || duration <= 0) return [1000];
  const candidates = [
    Math.max(500, Math.min(1500, Math.round(duration * 0.08))),
    Math.round(duration * 0.35),
    Math.round(duration * 0.68),
  ];
  const out = [];
  const seen = new Set();
  for (const raw of candidates) {
    const timeMs = Math.max(0, Math.min(Math.max(0, duration - 250), raw));
    const key = Math.round(timeMs / 250) * 250;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= VIDEO_FRAME_SAMPLE_LIMIT) break;
  }
  return out.length ? out : [0];
}

async function sampleVideoFrames(video) {
  if (!video?.localUri) {
    const marker = cloudWaitCandidate(video, 'video');
    return marker ? [marker] : [];
  }
  const frames = [];
  for (const timeMs of frameSampleTimes(video.duration)) {
    try {
      const frame = await VideoThumbnails.getThumbnailAsync(video.localUri, {
        time: timeMs,
        quality: 0.82,
      });
      frames.push({
        id: video.id,
        candidateId: `${video.id}#frame:${timeMs}`,
        sourceAssetId: video.id,
        mediaType: 'video',
        uri: frame.uri,
        localUri: frame.uri,
        previewUri: frame.uri,
        creationTime: video.creationTime,
        frameTimeMs: timeMs,
        duration: video.duration,
        width: frame.width || video.width,
        height: frame.height || video.height,
        videoUri: video.localUri,
        fileName: video.fileName,
        downloadStatus: 'ready',
      });
    } catch {
      // Some cloud-backed or DRM-edited videos cannot be thumbnailed locally.
    }
  }
  return frames;
}

export async function fetchVideoFrameCandidatesPage({ after, pageSize = 10, createdAfterMs } = {}) {
  const offset = after != null && after !== '' ? parseInt(String(after), 10) : 0;
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  const rows = await videoQuery(createdAfterMs).limit(pageSize).offset(safeOffset).exe();
  const videos = (await Promise.all(rows.map((asset) => mapAssetToVideo(asset).catch(() => null))))
    .filter(Boolean);
  const assets = [];
  for (const video of videos) {
    assets.push(...await sampleVideoFrames(video));
  }
  return {
    assets,
    sourceCount: videos.length,
    endCursor: String(safeOffset + rows.length),
    hasNextPage: rows.length === pageSize,
  };
}

export async function fetchMediaScanCandidatesByIds(assetIds = [], { createdAfterMs } = {}) {
  const seen = new Set();
  const uniqueIds = [];
  for (const assetId of assetIds) {
    const normalized = normalizeMediaLibraryAssetId(assetId);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    uniqueIds.push({ raw: String(assetId), normalized });
  }

  const minCreationTime = Number.isFinite(createdAfterMs) ? createdAfterMs : null;
  const rows = await Promise.all(uniqueIds.map(async ({ raw, normalized }) => {
    const candidates = raw === normalized ? [normalized] : [normalized, raw];
    for (const candidateId of candidates) {
      try {
        const asset = new Asset(assetConstructorIdentifier(candidateId, { platform: Platform.OS }));
        const mediaType = await asset.getMediaType().catch(() => null);
        if (mediaType !== MediaType.IMAGE && mediaType !== MediaType.VIDEO) continue;
        if (mediaType === MediaType.VIDEO) {
          const video = await mapAssetToVideo(asset);
          if (minCreationTime != null && video.creationTime && video.creationTime < minCreationTime) {
            return null;
          }
          return sampleVideoFrames(video);
        }
        const details = await getAssetDetails(candidateId, { downloadFromNetwork: true }).catch(() => null);
        const row = await mapAssetToLegacy(asset);
        if (minCreationTime != null && row.creationTime && row.creationTime < minCreationTime) {
          return null;
        }
        return {
          ...row,
          id: normalizeMediaLibraryAssetId(row.id) || normalized,
          localUri: details?.localUri || row.localUri,
          uri: details?.uri || row.uri,
          downloadStatus: details?.downloadStatus || 'ready',
          downloadError: details?.downloadError || null,
        };
      } catch {
        // Try the alternate raw/ph:// shape before giving up.
      }
    }
    return null;
  }));

  return rows.flat().filter(Boolean);
}

/**
 * Count photos in the birthday→now window (offset paging; no totalCount in SDK 56).
 */
export async function countPhotosInWindow({ createdAfterMs, pageSize = 200 } = {}) {
  return countMediaInWindow({ mediaType: MediaType.IMAGE, createdAfterMs, pageSize });
}

export async function countVideosInWindow({ createdAfterMs, pageSize = 200 } = {}) {
  return countMediaInWindow({ mediaType: MediaType.VIDEO, createdAfterMs, pageSize });
}

async function countMediaInWindow({ mediaType, createdAfterMs, pageSize = 200 } = {}) {
  let offset = 0;
  let total = 0;
  for (;;) {
    const rows = await mediaQuery(mediaType, createdAfterMs).limit(pageSize).offset(offset).exe();
    total += rows.length;
    if (rows.length < pageSize) return total;
    offset += pageSize;
  }
}

/**
 * Load one library asset by id (replaces getAssetInfoAsync).
 */
export async function getAssetDetails(assetId, {
  downloadFromNetwork: _downloadFromNetwork = false,
  mediaType,
} = {}) {
  if (!assetId) return null;
  const constructorIdentifier = assetConstructorIdentifier(assetId, {
    platform: Platform.OS,
    mediaType,
  });
  const visionUri = Platform.OS === 'ios'
    ? uriForNativeVision(assetId)
    : constructorIdentifier;
  try {
    return await readMediaLibraryAssetDetails({
      asset: new Asset(constructorIdentifier),
      assetId,
      visionUri,
    });
  } catch (err) {
    return {
      id: assetId,
      uri: visionUri,
      localUri: null,
      downloadStatus: 'failed',
      downloadError: String(err?.message || err || 'Could not load photo from library'),
    };
  }
}

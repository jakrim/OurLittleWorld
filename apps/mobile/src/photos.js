import {
  Asset,
  AssetField,
  MediaType,
  Query,
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';

/**
 * Helpers that talk to the photo library on behalf of Our Little World.
 * All expo-media-library access goes through this module (SDK 56 Query + Asset API).
 */

const DESC_CREATION = { key: AssetField.CREATION_TIME, ascending: false };
const VIDEO_FRAME_SAMPLE_LIMIT = 3;

export function normalizeMediaLibraryAssetId(assetId) {
  if (!assetId) return '';
  const raw = String(assetId);
  return raw.startsWith('ph://') ? raw.slice('ph://'.length) : raw;
}

function mediaQuery(mediaType, createdAfterMs) {
  let q = new Query()
    .eq(AssetField.MEDIA_TYPE, mediaType)
    .orderBy(DESC_CREATION);
  if (createdAfterMs != null && Number.isFinite(createdAfterMs)) {
    q = q.gte(AssetField.CREATION_TIME, createdAfterMs);
  }
  return q;
}

function imageQuery(createdAfterMs) {
  return mediaQuery(MediaType.IMAGE, createdAfterMs);
}

function videoQuery(createdAfterMs) {
  return mediaQuery(MediaType.VIDEO, createdAfterMs);
}

/** iOS Vision module expects ph:// URIs; asset ids are local identifiers. */
export function uriForNativeVision(assetId) {
  if (!assetId) return assetId;
  if (
    assetId.startsWith('ph://')
    || assetId.startsWith('file://')
    || assetId.startsWith('content://')
    || assetId.startsWith('assets-library://')
  ) {
    return assetId;
  }
  return `ph://${assetId}`;
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
  const [uri, creationTime, duration, width, height, fileName] = await Promise.all([
    asset.getUri(),
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
    creationTime: creationTime ?? 0,
    duration: duration ?? null,
    width: width || 0,
    height: height || 0,
    fileName,
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
export async function fetchPhotosPage({ after, pageSize = 60, createdAfterMs } = {}) {
  const offset = after != null && after !== '' ? parseInt(String(after), 10) : 0;
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  const rows = await imageQuery(createdAfterMs).limit(pageSize).offset(safeOffset).exe();
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
  if (!video?.localUri) return [];
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
        const asset = new Asset(candidateId);
        const mediaType = await asset.getMediaType().catch(() => null);
        if (mediaType !== MediaType.IMAGE && mediaType !== MediaType.VIDEO) return null;
        if (mediaType === MediaType.VIDEO) {
          const video = await mapAssetToVideo(asset);
          if (minCreationTime != null && video.creationTime && video.creationTime < minCreationTime) {
            return null;
          }
          return sampleVideoFrames(video);
        }
        const row = await mapAssetToLegacy(asset);
        if (minCreationTime != null && row.creationTime && row.creationTime < minCreationTime) {
          return null;
        }
        return {
          ...row,
          id: normalizeMediaLibraryAssetId(row.id) || normalized,
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
export async function getAssetDetails(assetId, { downloadFromNetwork: _downloadFromNetwork = false } = {}) {
  if (!assetId) return null;
  const asset = new Asset(assetId);
  const visionUri = uriForNativeVision(assetId);
  try {
    const [uri, creationTime, location, width, height, mediaType, duration, fileName] = await Promise.all([
      asset.getUri(),
      asset.getCreationTime(),
      asset.getLocation().catch(() => null),
      asset.getWidth().catch(() => null),
      asset.getHeight().catch(() => null),
      asset.getMediaType().catch(() => null),
      asset.getDuration().catch(() => null),
      asset.getFilename().catch(() => null),
    ]);
    return {
      id: assetId,
      mediaType,
      uri: visionUri,
      localUri: uri || visionUri,
      downloadStatus: uri ? 'ready' : 'pending',
      creationTime: creationTime ?? undefined,
      location,
      width: width ?? undefined,
      height: height ?? undefined,
      duration: duration ?? undefined,
      fileName,
    };
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

/**
 * Compute baby age at a given timestamp.
 * Returns a structured object so callers can format flexibly.
 */
export function ageAt(birthdayISO, takenAtMs) {
  if (!birthdayISO || !takenAtMs) return null;
  const birth = new Date(birthdayISO);
  const taken = new Date(takenAtMs);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(taken.getTime())) return null;

  let years = taken.getFullYear() - birth.getFullYear();
  let months = taken.getMonth() - birth.getMonth();
  let days = taken.getDate() - birth.getDate();

  if (days < 0) {
    months -= 1;
    const lastMonth = new Date(taken.getFullYear(), taken.getMonth(), 0);
    days += lastMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const diffMs = taken.getTime() - birth.getTime();
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const beforeBirth = diffMs < 0;

  return { years, months, days, totalDays, beforeBirth };
}

export function formatAge(age) {
  if (!age) return '';
  if (age.beforeBirth) return 'before they were born';
  if (age.totalDays === 0) return 'birth day';
  if (age.years === 0 && age.months === 0) {
    return `${age.totalDays} day${age.totalDays === 1 ? '' : 's'} old`;
  }
  if (age.years === 0) {
    const m = `${age.months} month${age.months === 1 ? '' : 's'}`;
    const d = age.days ? ` ${age.days}d` : '';
    return `${m}${d}`;
  }
  const y = `${age.years} year${age.years === 1 ? '' : 's'}`;
  const m = age.months ? ` ${age.months}m` : '';
  return `${y}${m}`;
}

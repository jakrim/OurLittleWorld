import { buildBestPhotoCandidateSet } from './bestPhotoCandidateModel.js';
import { isNative, matchAgainstReferenceProfile } from './faceMatcher';
import { fetchPhotosPage, getLibraryPermissionStatus, normalizeMediaLibraryAssetId } from './photos';
import { readReferenceProfile } from './recognitionReferences';
import * as Scan from './scanController';

export const BEST_PHOTO_SCAN_LIMIT = 48;
export const BEST_PHOTO_RECENT_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map();

export async function loadBestPhotoCandidates({
  familyId,
  userId,
  babyBirthday,
  createdAfterMs,
  createdBeforeMs,
  limit = 12,
  force = false,
} = {}) {
  if (!familyId || !userId || !isNative) return emptyResult('not-ready');
  const key = [familyId, userId, createdAfterMs || '', createdBeforeMs || '', limit].join(':');
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.result;

  const permission = await getLibraryPermissionStatus().catch(() => null);
  if (!permission?.granted) return emptyResult('permission');

  if (!createdAfterMs && !createdBeforeMs) {
    const recentFloor = Date.now() - BEST_PHOTO_RECENT_WINDOW_MS;
    const liveMatches = (Scan.getState()?.matches || []).filter((match) => (
      Number(match?.creationTime || 0) >= recentFloor
    ));
    const liveResult = normalizeCandidateResult(buildBestPhotoCandidateSet(liveMatches, { limit }), { userId });
    if (liveResult.photos.length >= Math.min(4, limit)) {
      const result = { ...liveResult, source: 'scan', reason: null };
      cache.set(key, { createdAt: Date.now(), result });
      return result;
    }
  }

  const profile = await readReferenceProfile({ familyId, userId });
  if (!profile?.references?.some((reference) => reference?.embedding?.length)) {
    return emptyResult('discovery-needed');
  }

  const page = await fetchPhotosPage({
    pageSize: BEST_PHOTO_SCAN_LIMIT,
    createdAfterMs,
    createdBeforeMs,
  });
  const assets = (page?.assets || []).filter((asset) => (
    asset?.id
    && (asset.localUri || asset.uri)
    && String(asset.mediaType || '').toLowerCase() !== 'video'
  ));
  const inputs = assets.map((asset) => ({
    assetId: asset.id,
    localUri: asset.localUri || asset.uri,
    creationTime: asset.creationTime,
  }));
  const scored = await matchAgainstReferenceProfile({
    profile,
    birthdayISO: babyBirthday,
    candidates: inputs,
    referenceLimit: 1,
  });
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const candidates = scored.map((score) => ({
    ...byId.get(score.assetId),
    ...score,
    mediaType: 'image',
    creationTime: byId.get(score.assetId)?.creationTime ?? null,
    uri: byId.get(score.assetId)?.uri || null,
    localUri: byId.get(score.assetId)?.localUri || byId.get(score.assetId)?.uri || null,
  }));
  const result = {
    ...normalizeCandidateResult(buildBestPhotoCandidateSet(candidates, { limit }), { userId }),
    source: 'local-analysis',
    reason: null,
  };
  cache.set(key, { createdAt: Date.now(), result });
  return result;
}

export function clearBestPhotoCandidateCache() {
  cache.clear();
}

function normalizeCandidateResult(result, { userId }) {
  return {
    ...result,
    photos: (result?.photos || []).map((photo) => {
      const assetId = normalizeMediaLibraryAssetId(photo.assetId || photo.id);
      const creationTime = Number(photo.creationTime || 0) || null;
      return {
        ...photo,
        assetId,
        asset_id: assetId,
        asset_owner_user_id: userId,
        localOnly: true,
        type: 'image',
        mediaType: 'image',
        creationTime,
        creation_time: creationTime ? new Date(creationTime).toISOString() : null,
        uri: photo.localUri || photo.uri,
      };
    }).filter((photo) => photo.assetId && photo.uri),
  };
}

function emptyResult(reason) {
  return { photos: [], analyzedCount: 0, suppressedCount: 0, source: null, reason };
}

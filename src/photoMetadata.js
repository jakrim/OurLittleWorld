/**
 * Central, persistent photo metadata cache for the Our Little World feature.
 *
 * The "Places" feature needs lat/lon for as many shared photos as we can get
 * — but `MediaLibrary.getAssetInfoAsync` only returns local metadata for
 * photos owned by THIS device's library, and even then it's a slow call
 * (PHImageManager request). To avoid the user needing to re-fetch this on
 * every cold start, we keep a small AsyncStorage-backed map keyed by
 * `${ownerUserId}:${assetId}`.
 *
 *   { location: { latitude, longitude } | null, fetchedAt }
 *
 * The cache is intentionally ephemeral on miss — `null` is a valid cached
 * value meaning "we asked, there was no geotag".
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';

const STORAGE_KEY = (familyId) => `olw:photo-meta:${familyId || 'global'}`;

const memCache = new Map();
let loadedFamilyId = null;
let loadingPromise = null;

function keyFor(photo) {
  return `${photo.asset_owner_user_id}:${photo.asset_id}`;
}

async function loadFromDisk(familyId) {
  if (loadedFamilyId === familyId && !loadingPromise) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY(familyId));
      const parsed = raw ? JSON.parse(raw) : {};
      for (const [k, v] of Object.entries(parsed)) memCache.set(k, v);
      loadedFamilyId = familyId;
    } catch {}
    loadingPromise = null;
  })();
  return loadingPromise;
}

let pendingFlush = null;
async function flushToDisk(familyId) {
  if (pendingFlush) return pendingFlush;
  pendingFlush = (async () => {
    try {
      const obj = Object.fromEntries(memCache);
      await AsyncStorage.setItem(STORAGE_KEY(familyId), JSON.stringify(obj));
    } catch {}
    pendingFlush = null;
  })();
  return pendingFlush;
}

export async function loadCache(familyId) {
  await loadFromDisk(familyId);
  return Object.fromEntries(memCache);
}

export function snapshot() {
  return Object.fromEntries(memCache);
}

/**
 * For the given list of shared photos owned by the current device's user,
 * load any missing local metadata in parallel and return a fresh snapshot.
 *
 *   ensureMetadataFor({ familyId, photos, ownerUserId, onProgress })
 *
 * Photos owned by other users are skipped (we cannot fetch them locally).
 * Returns the new snapshot map on completion.
 */
export async function ensureMetadataFor({ familyId, photos, ownerUserId, concurrency = 6 }) {
  if (!photos?.length) return snapshot();
  await loadFromDisk(familyId);

  const queue = [];
  for (const photo of photos) {
    if (photo.asset_owner_user_id !== ownerUserId) continue;
    const key = keyFor(photo);
    if (memCache.has(key)) continue;
    queue.push({ photo, key });
  }
  if (!queue.length) return snapshot();

  let touched = false;
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) return;
      const { photo, key } = next;
      try {
        const info = await MediaLibrary.getAssetInfoAsync(photo.asset_id);
        const lat = info?.location?.latitude;
        const lon = info?.location?.longitude;
        const value = (typeof lat === 'number' && typeof lon === 'number')
          ? { location: { latitude: lat, longitude: lon }, fetchedAt: Date.now() }
          : { location: null, fetchedAt: Date.now() };
        memCache.set(key, value);
        touched = true;
      } catch {
        memCache.set(key, { location: null, fetchedAt: Date.now() });
        touched = true;
      }
    }
  });
  await Promise.all(workers);

  if (touched) flushToDisk(familyId);
  return snapshot();
}

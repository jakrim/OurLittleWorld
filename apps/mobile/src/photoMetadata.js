/**
 * Central, persistent photo metadata cache for the Our Little World feature.
 *
 * The "Places" feature needs lat/lon for as many shared photos as we can get
 * — but `MediaLibrary.getAssetInfoAsync` only returns local metadata for
 * photos owned by THIS device's library, and even then it's a slow call
 * (PHImageManager request). We persist successful reads to Supabase so partner
 * devices can see places too, and keep a small AsyncStorage-backed map keyed by
 * `${ownerUserId}:${assetId}` for cold-start speed.
 *
 *   { location: { latitude, longitude } | null, fetchedAt }
 *
 * The cache is intentionally ephemeral on miss — `null` is a valid cached
 * value meaning "we asked, there was no geotag".
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAssetDetails } from './photos';

import { supabase } from './supabase';

const STORAGE_KEY = (familyId) => `olw:photo-meta:${familyId || 'global'}`;
const NULL_LOCATION_RETRY_MS = 1000 * 60 * 60 * 24 * 7;

const memCache = new Map();
let loadedFamilyId = null;
let loadingPromise = null;

function keyFor(photo) {
  return `${photo.asset_owner_user_id}:${photo.asset_id}`;
}

function normalizeLocation(source) {
  const latitude = Number(source?.location?.latitude ?? source?.latitude);
  const longitude = Number(source?.location?.longitude ?? source?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function metadataValue({ location, fetchedAt }) {
  return {
    location,
    fetchedAt: fetchedAt || Date.now(),
  };
}

function shouldFetchLocal(photo, cached) {
  if (normalizeLocation(photo)) return false;
  if (!photo.location_fetched_at) return true;
  if (!cached) return true;
  if (cached.location) return false;
  const fetchedAt = Number(cached.fetchedAt || 0);
  return !fetchedAt || Date.now() - fetchedAt > NULL_LOCATION_RETRY_MS;
}

async function persistLocation({ familyId, ownerUserId, assetId, location, fetchedAt }) {
  if (!familyId || !ownerUserId || !assetId) return;
  const { error } = await supabase
    .from('photo_tags')
    .update({
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      location_fetched_at: new Date(fetchedAt).toISOString(),
    })
    .eq('family_id', familyId)
    .eq('asset_owner_user_id', ownerUserId)
    .eq('asset_id', assetId);
  if (error) console.warn('persist photo location', error.message);
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
    const key = keyFor(photo);
    const rowLocation = normalizeLocation(photo);
    if (rowLocation || photo.location_fetched_at) {
      memCache.set(
        key,
        metadataValue({
          location: rowLocation,
          fetchedAt: photo.location_fetched_at
            ? new Date(photo.location_fetched_at).getTime()
            : Date.now(),
        }),
      );
    }
    if (photo.asset_owner_user_id !== ownerUserId) continue;
    const cached = memCache.get(key);
    if (!rowLocation && cached?.location) {
      queue.push({
        photo,
        key,
        cachedLocation: cached.location,
        cachedFetchedAt: cached.fetchedAt || Date.now(),
      });
      continue;
    }
    if (!shouldFetchLocal(photo, cached)) continue;
    queue.push({ photo, key });
  }
  if (!queue.length) {
    flushToDisk(familyId);
    return snapshot();
  }

  let touched = false;
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) return;
      const { photo, key, cachedLocation, cachedFetchedAt } = next;
      try {
        if (cachedLocation) {
          await persistLocation({
            familyId,
            ownerUserId,
            assetId: photo.asset_id,
            location: cachedLocation,
            fetchedAt: cachedFetchedAt,
          });
          touched = true;
          continue;
        }
        const info = await getAssetDetails(photo.asset_id);
        if (!info) continue;
        const fetchedAt = Date.now();
        const location = normalizeLocation(info);
        const value = metadataValue({ location, fetchedAt });
        memCache.set(key, value);
        await persistLocation({
          familyId,
          ownerUserId,
          assetId: photo.asset_id,
          location,
          fetchedAt,
        });
        touched = true;
      } catch {
        if (!cachedLocation) {
          memCache.set(key, metadataValue({ location: null, fetchedAt: Date.now() }));
        }
        touched = true;
      }
    }
  });
  await Promise.all(workers);

  if (touched) flushToDisk(familyId);
  return snapshot();
}

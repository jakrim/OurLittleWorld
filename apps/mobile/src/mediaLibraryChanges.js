import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addListener } from 'expo-media-library';

import { getLibraryPermissionStatus, normalizeMediaLibraryAssetId } from './photos';

const VERSION = 'v1';
const MAX_STORED_INSERTED_ASSET_IDS = 500;

export function mediaLibraryChangeStorageKey({ familyId, userId }) {
  return `olw:media-library-change:${VERSION}:${familyId}:${userId}`;
}

function uniqueAssetIds(ids) {
  const out = [];
  const seen = new Set();
  for (const value of ids || []) {
    const assetId = normalizeMediaLibraryAssetId(value);
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);
    out.push(assetId);
  }
  return out;
}

function normalizeEvent(event = {}) {
  const insertedAssetIds = uniqueAssetIds(event.insertedAssets);
  const deletedCount = Array.isArray(event.deletedAssets) ? event.deletedAssets.length : 0;
  const updatedCount = Array.isArray(event.updatedAssets) ? event.updatedAssets.length : 0;
  const hasIncrementalChanges = event?.hasIncrementalChanges === true;

  return {
    firstChangedAt: new Date().toISOString(),
    changedAt: new Date().toISOString(),
    eventCount: 1,
    hasIncrementalChanges,
    insertedCount: insertedAssetIds.length,
    deletedCount,
    updatedCount,
    insertedAssetIds: insertedAssetIds.slice(0, MAX_STORED_INSERTED_ASSET_IDS),
    insertedAssetIdsTruncated: insertedAssetIds.length > MAX_STORED_INSERTED_ASSET_IDS,
    requiresFullLibraryScan: !hasIncrementalChanges || insertedAssetIds.length > MAX_STORED_INSERTED_ASSET_IDS,
  };
}

function normalizeStoredChange(change) {
  if (!change) return null;
  const insertedAssetIds = uniqueAssetIds(change.insertedAssetIds);
  const insertedCount = Number(change.insertedCount || insertedAssetIds.length || 0);
  const deletedCount = Number(change.deletedCount || 0);
  const updatedCount = Number(change.updatedCount || 0);

  return {
    firstChangedAt: change.firstChangedAt || change.changedAt || new Date().toISOString(),
    changedAt: change.changedAt || new Date().toISOString(),
    eventCount: Number(change.eventCount || 1),
    hasIncrementalChanges: change.hasIncrementalChanges === true,
    insertedCount,
    deletedCount,
    updatedCount,
    insertedAssetIds: insertedAssetIds.slice(0, MAX_STORED_INSERTED_ASSET_IDS),
    insertedAssetIdsTruncated: !!change.insertedAssetIdsTruncated,
    requiresFullLibraryScan: change.requiresFullLibraryScan !== false,
  };
}

function mergeChanges(previous, next) {
  const prev = normalizeStoredChange(previous);
  if (!prev) return normalizeStoredChange(next);

  const insertedAssetIds = uniqueAssetIds([
    ...prev.insertedAssetIds,
    ...next.insertedAssetIds,
  ]);
  const insertedCount = prev.insertedCount + next.insertedCount;
  const insertedAssetIdsTruncated =
    prev.insertedAssetIdsTruncated
    || next.insertedAssetIdsTruncated
    || insertedAssetIds.length > MAX_STORED_INSERTED_ASSET_IDS;

  return {
    firstChangedAt: prev.firstChangedAt,
    changedAt: next.changedAt,
    eventCount: prev.eventCount + next.eventCount,
    hasIncrementalChanges: prev.hasIncrementalChanges && next.hasIncrementalChanges,
    insertedCount,
    deletedCount: prev.deletedCount + next.deletedCount,
    updatedCount: prev.updatedCount + next.updatedCount,
    insertedAssetIds: insertedAssetIds.slice(0, MAX_STORED_INSERTED_ASSET_IDS),
    insertedAssetIdsTruncated,
    requiresFullLibraryScan:
      prev.requiresFullLibraryScan
      || next.requiresFullLibraryScan
      || insertedAssetIdsTruncated,
  };
}

export async function readPendingMediaLibraryChange({ familyId, userId }) {
  if (!familyId || !userId) return null;
  const raw = await AsyncStorage.getItem(mediaLibraryChangeStorageKey({ familyId, userId }));
  if (!raw) return null;
  try {
    return normalizeStoredChange(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function recordMediaLibraryChange({ familyId, userId, event }) {
  if (!familyId || !userId) return null;
  const key = mediaLibraryChangeStorageKey({ familyId, userId });
  const next = normalizeEvent(event);
  const previous = await readPendingMediaLibraryChange({ familyId, userId });
  const merged = mergeChanges(previous, next);
  await AsyncStorage.setItem(key, JSON.stringify(merged));
  return merged;
}

export async function clearPendingMediaLibraryChange({ familyId, userId }) {
  if (!familyId || !userId) return;
  await AsyncStorage.removeItem(mediaLibraryChangeStorageKey({ familyId, userId }));
}

export function describeMediaLibraryChange(change) {
  if (!change) return '';
  const parts = [];
  if (change.insertedCount) {
    parts.push(`${change.insertedCount} new photo${change.insertedCount === 1 ? '' : 's'}`);
  }
  if (change.updatedCount) {
    parts.push(`${change.updatedCount} update${change.updatedCount === 1 ? '' : 's'}`);
  }
  if (change.deletedCount) {
    parts.push(`${change.deletedCount} removal${change.deletedCount === 1 ? '' : 's'}`);
  }
  if (parts.length) return parts.join(' · ');
  return change.requiresFullLibraryScan ? 'Library permissions or contents changed' : 'Photo library changed';
}

export function useMediaLibraryChangeObserver({ familyId, userId, enabled = true }) {
  const [pendingChange, setPendingChange] = useState(null);

  useEffect(() => {
    let mounted = true;
    let subscription = null;

    if (!enabled || !familyId || !userId) {
      setPendingChange(null);
      return undefined;
    }

    readPendingMediaLibraryChange({ familyId, userId })
      .then((change) => {
        if (mounted) setPendingChange(change);
      })
      .catch(() => {});

    (async () => {
      try {
        const permission = await getLibraryPermissionStatus();
        if (!mounted || !permission.granted || typeof addListener !== 'function') return;
        subscription = addListener((event) => {
          recordMediaLibraryChange({ familyId, userId, event })
            .then((change) => {
              if (mounted) setPendingChange(change);
            })
            .catch(() => {});
        });
      } catch {
        // The observer is opportunistic; scans still work without it.
      }
    })();

    return () => {
      mounted = false;
      if (subscription?.remove) subscription.remove();
    };
  }, [enabled, familyId, userId]);

  const clearPendingChange = useCallback(async () => {
    await clearPendingMediaLibraryChange({ familyId, userId });
    setPendingChange(null);
  }, [familyId, userId]);

  return { pendingChange, clearPendingChange };
}

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addListener } from 'expo-media-library';

import { getLibraryPermissionStatus } from './photos';
import {
  mergeMediaLibraryChanges,
  normalizeMediaLibraryChangeEvent,
  normalizeStoredMediaLibraryChange,
} from './mediaLibraryChangeModel';

const VERSION = 'v1';
export function mediaLibraryChangeStorageKey({ familyId, userId }) {
  return `olw:media-library-change:${VERSION}:${familyId}:${userId}`;
}

export async function readPendingMediaLibraryChange({ familyId, userId }) {
  if (!familyId || !userId) return null;
  const raw = await AsyncStorage.getItem(mediaLibraryChangeStorageKey({ familyId, userId }));
  if (!raw) return null;
  try {
    return normalizeStoredMediaLibraryChange(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function recordMediaLibraryChange({ familyId, userId, event }) {
  if (!familyId || !userId) return null;
  const key = mediaLibraryChangeStorageKey({ familyId, userId });
  const next = normalizeMediaLibraryChangeEvent(event);
  const previous = await readPendingMediaLibraryChange({ familyId, userId });
  const merged = mergeMediaLibraryChanges(previous, next);
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

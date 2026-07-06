import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ICLOUD_QUEUE_VERSION = 'v1';
const ICLOUD_QUEUE_MAX_ITEMS = 200;
const ICLOUD_QUEUE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function queueKey({ familyId, userId }) {
  return `olw:icloud-retry:${ICLOUD_QUEUE_VERSION}:${familyId}:${userId}`;
}

function normalizeAssetIds(assetIds) {
  return [...new Set((assetIds || []).map((assetId) => String(assetId || '').trim()).filter(Boolean))];
}

function pruneEntries(entries, nowMs = Date.now()) {
  return (entries || [])
    .filter((entry) => entry?.assetId && nowMs - Number(entry.lastSeenAt || 0) <= ICLOUD_QUEUE_MAX_AGE_MS)
    .sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0))
    .slice(0, ICLOUD_QUEUE_MAX_ITEMS);
}

export async function readICloudRetryQueue({ familyId, userId } = {}) {
  if (!familyId || !userId) return { entries: [], assetIds: [], count: 0 };
  const raw = await AsyncStorage.getItem(queueKey({ familyId, userId }));
  let entries = [];
  if (raw) {
    try {
      entries = JSON.parse(raw)?.entries || [];
    } catch {}
  }
  const pruned = pruneEntries(entries);
  if (pruned.length !== entries.length) {
    await AsyncStorage.setItem(queueKey({ familyId, userId }), JSON.stringify({ entries: pruned }));
  }
  return {
    entries: pruned,
    assetIds: pruned.map((entry) => entry.assetId),
    count: pruned.length,
  };
}

export async function recordICloudWait({
  familyId,
  userId,
  assetIds,
  source = 'scan',
  reason = 'Waiting for the original to download from iCloud.',
} = {}) {
  const ids = normalizeAssetIds(assetIds);
  if (!familyId || !userId || !ids.length) return readICloudRetryQueue({ familyId, userId });
  const current = await readICloudRetryQueue({ familyId, userId });
  const nowMs = Date.now();
  const byId = new Map(current.entries.map((entry) => [entry.assetId, entry]));
  for (const assetId of ids) {
    const existing = byId.get(assetId) || {};
    byId.set(assetId, {
      assetId,
      source: source || existing.source || 'scan',
      reason: reason || existing.reason || 'Waiting for the original to download from iCloud.',
      firstSeenAt: existing.firstSeenAt || nowMs,
      lastSeenAt: nowMs,
      attempts: Number(existing.attempts || 0) + 1,
    });
  }
  const entries = pruneEntries(Array.from(byId.values()), nowMs);
  await AsyncStorage.setItem(queueKey({ familyId, userId }), JSON.stringify({ entries }));
  return {
    entries,
    assetIds: entries.map((entry) => entry.assetId),
    count: entries.length,
  };
}

export async function clearICloudWait({ familyId, userId, assetIds } = {}) {
  const ids = new Set(normalizeAssetIds(assetIds));
  if (!familyId || !userId || !ids.size) return readICloudRetryQueue({ familyId, userId });
  const current = await readICloudRetryQueue({ familyId, userId });
  const entries = current.entries.filter((entry) => !ids.has(entry.assetId));
  await AsyncStorage.setItem(queueKey({ familyId, userId }), JSON.stringify({ entries }));
  return {
    entries,
    assetIds: entries.map((entry) => entry.assetId),
    count: entries.length,
  };
}

export function useICloudRetryCount({ familyId, userId, refreshKey } = {}) {
  const [queue, setQueue] = useState({ count: 0, assetIds: [] });

  useEffect(() => {
    let alive = true;
    const load = () => {
      readICloudRetryQueue({ familyId, userId })
        .then((next) => {
          if (alive) setQueue({ count: next.count, assetIds: next.assetIds });
        })
        .catch(() => {
          if (alive) setQueue({ count: 0, assetIds: [] });
        });
    };
    load();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [familyId, userId, refreshKey]);

  return queue;
}

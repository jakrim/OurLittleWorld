import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

const VERSION = 'v2';
const INCREMENTAL_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

export function scanCheckpointStorageKey({ familyId, userId }) {
  return `olw:scan-checkpoint:${VERSION}:${familyId}:${userId}`;
}

export async function clearScanCheckpoint({ familyId, userId }) {
  if (!familyId || !userId) return;
  await AsyncStorage.multiRemove([
    scanCheckpointStorageKey({ familyId, userId }),
    `olw:scan-checkpoint:v1:${familyId}:${userId}`,
  ]);
  try {
    await supabase
      .from('scan_checkpoints')
      .delete()
      .eq('family_id', familyId)
      .eq('user_id', userId);
  } catch {
    // Local state controls the next scan when the network is unavailable.
  }
}

function normalize(row) {
  return {
    lastScannedAt: row?.lastScannedAt || row?.last_scanned_at || null,
    lastCursor: row?.lastCursor || row?.last_cursor || null,
    updatedAt: row?.updatedAt || row?.updated_at || null,
  };
}

async function readLocal({ familyId, userId }) {
  if (!familyId || !userId) return normalize(null);
  const raw = await AsyncStorage.getItem(scanCheckpointStorageKey({ familyId, userId }));
  if (!raw) return normalize(null);
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return normalize(null);
  }
}

async function writeLocal({ familyId, userId, checkpoint }) {
  if (!familyId || !userId) return;
  await AsyncStorage.setItem(
    scanCheckpointStorageKey({ familyId, userId }),
    JSON.stringify(normalize(checkpoint)),
  );
}

export async function readScanCheckpoint({ familyId, userId }) {
  const local = await readLocal({ familyId, userId });
  if (!familyId || !userId) return local;

  try {
    const { data, error } = await supabase
      .from('scan_checkpoints')
      .select('last_scanned_at, last_cursor, updated_at')
      .eq('family_id', familyId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return local;
    const remote = normalize(data);
    const localTime = new Date(local.updatedAt || local.lastScannedAt || 0).getTime();
    const remoteTime = new Date(remote.updatedAt || remote.lastScannedAt || 0).getTime();
    const next = remoteTime >= localTime ? remote : local;
    await writeLocal({ familyId, userId, checkpoint: next });
    return next;
  } catch {
    return local;
  }
}

export async function writeScanCheckpoint({ familyId, userId, checkpoint }) {
  const next = normalize({
    ...checkpoint,
    updatedAt: new Date().toISOString(),
  });
  await writeLocal({ familyId, userId, checkpoint: next });
  if (!familyId || !userId) return next;

  try {
    await supabase.from('scan_checkpoints').upsert(
      {
        family_id: familyId,
        user_id: userId,
        last_scanned_at: next.lastScannedAt,
        last_cursor: next.lastCursor,
      },
      { onConflict: 'family_id,user_id' },
    );
  } catch {
    // Local checkpointing is enough to keep repeat scans incremental on device.
  }

  return next;
}

export function sinceMsForScan({ babyBirthday, checkpoint, forceFullRescan = false }) {
  const birthdayMs = babyBirthday
    ? new Date(`${babyBirthday}T00:00:00`).getTime()
    : null;
  const checkpointMs = !forceFullRescan && checkpoint?.lastScannedAt
    ? new Date(checkpoint.lastScannedAt).getTime() - INCREMENTAL_LOOKBACK_MS
    : null;
  const candidates = [birthdayMs, checkpointMs].filter((value) => Number.isFinite(value));
  if (!candidates.length) return undefined;
  return Math.max(...candidates);
}

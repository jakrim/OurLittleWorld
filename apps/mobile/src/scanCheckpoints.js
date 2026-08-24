import AsyncStorage from '@react-native-async-storage/async-storage';

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
  return readLocal({ familyId, userId });
}

export async function writeScanCheckpoint({ familyId, userId, checkpoint }) {
  const next = normalize({
    ...checkpoint,
    updatedAt: new Date().toISOString(),
  });
  await writeLocal({ familyId, userId, checkpoint: next });
  return next;
}

export function scanResumeState(checkpoint) {
  if (!checkpoint?.lastCursor) return null;
  try {
    const value = JSON.parse(checkpoint.lastCursor);
    if (value?.version !== 1 || value?.historicalComplete === true) return null;
    return {
      photoCursor: safeCursor(value.photoCursor),
      videoCursor: safeCursor(value.videoCursor),
      photosComplete: value.photosComplete === true,
      videosComplete: value.videosComplete === true,
      sinceMs: finiteOrNull(value.sinceMs),
    };
  } catch {
    return null;
  }
}

export function scanCheckpointForState({ finalState, previousCheckpoint = null, sinceMs = null } = {}) {
  const historicalComplete = finalState?.photosComplete === true && finalState?.videosComplete === true;
  const finishedAt = Number(finalState?.finishedAt || Date.now());
  return {
    lastScannedAt: historicalComplete
      ? new Date(finishedAt).toISOString()
      : previousCheckpoint?.lastScannedAt || null,
    lastCursor: JSON.stringify({
      version: 1,
      scanKey: finalState?.scanKey || null,
      checked: Math.max(0, Number(finalState?.checked || 0)),
      sinceMs: finiteOrNull(sinceMs),
      photoCursor: safeCursor(finalState?.photoCursor),
      videoCursor: safeCursor(finalState?.videoCursor),
      photosComplete: finalState?.photosComplete === true,
      videosComplete: finalState?.videosComplete === true,
      historicalComplete,
    }),
  };
}

export function sinceMsForScan({ babyBirthday, checkpoint, forceFullRescan = false }) {
  const birthdayMs = babyBirthday
    ? new Date(`${babyBirthday}T00:00:00`).getTime()
    : null;
  const resume = !forceFullRescan ? scanResumeState(checkpoint) : null;
  const checkpointMs = !resume && !forceFullRescan && checkpoint?.lastScannedAt
    ? new Date(checkpoint.lastScannedAt).getTime() - INCREMENTAL_LOOKBACK_MS
    : null;
  const candidates = [birthdayMs, resume?.sinceMs, checkpointMs].filter((value) => Number.isFinite(value));
  if (!candidates.length) return undefined;
  return Math.max(...candidates);
}

function safeCursor(value) {
  const cursor = typeof value === 'string' ? value.trim() : '';
  return cursor && cursor.length <= 2048 ? cursor : null;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

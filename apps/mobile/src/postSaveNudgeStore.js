import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  markPostSaveNudgeDismissed,
  markPostSaveNudgeShown,
  normalizePostSaveNudgeState,
} from './postSaveNudgeModel';

export async function readPostSaveNudgeState({ familyId, userId } = {}) {
  if (!familyId) return normalizePostSaveNudgeState();
  try {
    const raw = await AsyncStorage.getItem(postSaveNudgeStorageKey({ familyId, userId }));
    return normalizePostSaveNudgeState(raw ? JSON.parse(raw) : null);
  } catch (err) {
    console.warn('readPostSaveNudgeState', err?.message);
    return normalizePostSaveNudgeState();
  }
}

export async function recordPostSaveNudgeShown({ familyId, userId, now = new Date() } = {}) {
  if (!familyId) return normalizePostSaveNudgeState();
  const current = await readPostSaveNudgeState({ familyId, userId });
  const next = markPostSaveNudgeShown(current, now);
  await writePostSaveNudgeState({ familyId, userId, state: next });
  return next;
}

export async function dismissPostSaveNudge({ familyId, userId, momentId, now = new Date() } = {}) {
  if (!familyId || !momentId) return normalizePostSaveNudgeState();
  const current = await readPostSaveNudgeState({ familyId, userId });
  const next = markPostSaveNudgeDismissed(current, momentId, now);
  await writePostSaveNudgeState({ familyId, userId, state: next });
  return next;
}

async function writePostSaveNudgeState({ familyId, userId, state }) {
  try {
    await AsyncStorage.setItem(
      postSaveNudgeStorageKey({ familyId, userId }),
      JSON.stringify(normalizePostSaveNudgeState(state)),
    );
  } catch (err) {
    console.warn('writePostSaveNudgeState', err?.message);
  }
}

function postSaveNudgeStorageKey({ familyId, userId }) {
  return `olw:post-save-nudges:v1:${familyId}:${userId || 'anonymous'}`;
}

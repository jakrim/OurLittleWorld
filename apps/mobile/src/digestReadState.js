import AsyncStorage from '@react-native-async-storage/async-storage';

function storageKey(familyId) {
  return `olw:digest-read:v1:${familyId}`;
}

// Returns the weekStart ISO date of the most recently read digest, or null.
export async function getReadDigestWeek(familyId) {
  if (!familyId) return null;
  try {
    return await AsyncStorage.getItem(storageKey(familyId));
  } catch {
    return null;
  }
}

export async function markDigestRead(familyId, weekStart) {
  if (!familyId || !weekStart) return;
  try {
    await AsyncStorage.setItem(storageKey(familyId), weekStart);
  } catch {
    // best effort — an unread flag just re-shows the nudge
  }
}

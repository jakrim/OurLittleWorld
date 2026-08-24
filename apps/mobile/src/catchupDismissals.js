import AsyncStorage from '@react-native-async-storage/async-storage';

function storageKey(familyId) {
  return `olw:catchup-dismissals:v1:${familyId}`;
}

// { [goalKey]: epochMs of dismissal }
export async function loadCatchupDismissals(familyId) {
  if (!familyId) return {};
  try {
    const raw = await AsyncStorage.getItem(storageKey(familyId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function dismissCatchupGoal(familyId, goalKey, now = new Date()) {
  if (!familyId || !goalKey) return;
  try {
    const current = await loadCatchupDismissals(familyId);
    current[goalKey] = now.getTime();
    await AsyncStorage.setItem(storageKey(familyId), JSON.stringify(current));
  } catch {
    // best effort — a lost dismissal just re-shows the card
  }
}

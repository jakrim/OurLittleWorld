import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  firstValuePreviewStorageKey,
  isFirstValuePreview,
} from './firstValuePreviewModel';

export async function readFirstValuePreview({ familyId, userId }) {
  const key = firstValuePreviewStorageKey({ familyId, userId });
  if (!key) return null;
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isFirstValuePreview(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeFirstValuePreview({ familyId, userId, preview }) {
  const key = firstValuePreviewStorageKey({ familyId, userId });
  if (!key || !isFirstValuePreview(preview)) throw new Error('A valid local preview is required.');
  await AsyncStorage.setItem(key, JSON.stringify(preview));
  return preview;
}

export async function clearFirstValuePreview({ familyId, userId }) {
  const key = firstValuePreviewStorageKey({ familyId, userId });
  if (key) await AsyncStorage.removeItem(key);
}

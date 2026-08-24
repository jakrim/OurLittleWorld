import AsyncStorage from '@react-native-async-storage/async-storage';

import { AUTO_SEED_SUGGESTION_LIMIT } from './referenceAutoSeedModel.js';

const ATTEMPT_VERSION = 1;
const ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;

export function referenceAutoSeedAttemptKey({ familyId, userId } = {}) {
  if (!familyId || !userId) return null;
  return `olw:reference-auto-seed-attempt:v${ATTEMPT_VERSION}:${familyId}:${userId}`;
}

export async function readReferenceAutoSeedAttempt({
  familyId,
  userId,
  birthdayISO,
  now = Date.now(),
} = {}) {
  const key = referenceAutoSeedAttemptKey({ familyId, userId });
  if (!key) return null;
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed?.version !== ATTEMPT_VERSION
      || parsed?.birthdayISO !== birthdayISO
      || !Number.isFinite(Number(parsed?.completedAt))
      || now - Number(parsed.completedAt) > ATTEMPT_TTL_MS
    ) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return normalizeReferenceAutoSeedAttempt(parsed);
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export async function writeReferenceAutoSeedAttempt({
  familyId,
  userId,
  birthdayISO,
  attempt,
  now = Date.now(),
} = {}) {
  const key = referenceAutoSeedAttemptKey({ familyId, userId });
  if (!key || !birthdayISO || !attempt?.status) return null;
  const normalized = normalizeReferenceAutoSeedAttempt({
    ...attempt,
    version: ATTEMPT_VERSION,
    birthdayISO,
    completedAt: now,
  });
  await AsyncStorage.setItem(key, JSON.stringify(normalized));
  return normalized;
}

export async function clearReferenceAutoSeedAttempt({ familyId, userId } = {}) {
  const key = referenceAutoSeedAttemptKey({ familyId, userId });
  if (key) await AsyncStorage.removeItem(key);
}

export function normalizeReferenceAutoSeedAttempt(value) {
  const suggestions = Array.isArray(value?.suggestions)
    ? value.suggestions
      .filter((item) => item?.assetId && item?.embedding?.length && (item?.localUri || item?.uri))
      .map(normalizeSuggestion)
      .slice(0, AUTO_SEED_SUGGESTION_LIMIT)
    : [];
  const status = value?.status === 'suggestions' && suggestions.length
    ? 'suggestions'
    : 'manual';
  return {
    version: ATTEMPT_VERSION,
    birthdayISO: value?.birthdayISO,
    completedAt: Number(value?.completedAt) || Date.now(),
    status,
    reason: value?.reason || null,
    evidencePolicy: value?.evidencePolicy || null,
    suggestions,
    selectedAssetId: suggestions.some((item) => item.assetId === value?.selectedAssetId)
      ? value.selectedAssetId
      : null,
  };
}

function normalizeSuggestion(item) {
  return {
    assetId: item.assetId,
    localUri: item.localUri || null,
    uri: item.uri || item.localUri || null,
    width: finiteOrNull(item.width),
    height: finiteOrNull(item.height),
    creationTime: finiteOrNull(item.creationTime),
    embedding: item.embedding,
    faceCount: finiteOrNull(item.faceCount) || 1,
    bucketKey: item.bucketKey || null,
    evidenceBucketKey: item.evidenceBucketKey || null,
    captureQuality: finiteOrNull(item.captureQuality),
    sharpness: finiteOrNull(item.sharpness),
    faceSizeRatio: finiteOrNull(item.faceSizeRatio),
    primaryBox: item.primaryBox || null,
    yaw: finiteOrNull(item.yaw),
    roll: finiteOrNull(item.roll),
    brightness: finiteOrNull(item.brightness),
    identityConfidence: finiteOrNull(item.identityConfidence),
    qualityScore: finiteOrNull(item.qualityScore),
  };
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

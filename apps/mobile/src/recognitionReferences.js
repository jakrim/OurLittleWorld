import AsyncStorage from '@react-native-async-storage/async-storage';

import { uuid } from './moments';
import {
  REFERENCE_PROFILE_VERSION,
  ageDaysAt,
  ageDaysForCandidate,
  normalizeReferenceProfile,
  removeReferenceFromProfile,
  representativeReference,
  referenceWeightForCandidate,
  selectReferencesForCandidates,
} from './recognitionReferenceModel';

export {
  ageDaysAt,
  ageDaysForCandidate,
  referenceWeightForCandidate,
  selectReferencesForCandidates,
};

export function referenceStorageKey({ familyId, userId }) {
  return `olw:reference:${familyId}:${userId}`;
}

export function referenceSetStorageKey({ familyId, userId }) {
  return `olw:reference-set:${REFERENCE_PROFILE_VERSION}:${familyId}:${userId}`;
}

function normalizeProfile(profile) {
  return normalizeReferenceProfile(profile, { makeId: uuid });
}

export async function readReferenceProfile({ familyId, userId }) {
  if (!familyId || !userId) return normalizeProfile(null);
  const raw = await AsyncStorage.getItem(referenceSetStorageKey({ familyId, userId }));
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizeProfile(parsed);
      if (parsed?.representativeReferenceId !== normalized.representativeReferenceId) {
        await writeReferenceProfile({ familyId, userId, profile: normalized });
      }
      return normalized;
    } catch {}
  }
  // v2 intentionally does not migrate the legacy single-reference key. The
  // old matcher could learn from an automatically selected false positive;
  // silently carrying that reference forward would preserve the exact trust
  // failure this profile version is designed to remove.
  return normalizeProfile(null);
}

export async function writeReferenceProfile({ familyId, userId, profile }) {
  if (!familyId || !userId) return normalizeProfile(profile);
  const normalized = normalizeProfile({ ...profile, updatedAt: Date.now() });
  await AsyncStorage.setItem(referenceSetStorageKey({ familyId, userId }), JSON.stringify(normalized));
  const representative = representativeReference(normalized);
  if (representative) {
    await AsyncStorage.setItem(
      referenceStorageKey({ familyId, userId }),
      JSON.stringify({
        uri: representative.uri,
        assetId: representative.assetId,
        embedding: representative.embedding,
        faceCount: representative.faceCount,
        capturedAt: representative.capturedAt,
        ageAtCaptureDays: representative.ageAtCaptureDays,
        referenceId: representative.id,
      }),
    );
  } else {
    await AsyncStorage.removeItem(referenceStorageKey({ familyId, userId }));
  }
  return normalized;
}

export async function addReferenceImage({
  familyId,
  userId,
  birthdayISO,
  uri,
  assetId,
  embedding,
  faceCount,
  capturedAt = Date.now(),
  source = 'seed',
  weight = 1,
  confirmedKeeps = 0,
  confirmedSkips = 0,
  parentConfirmed = false,
  captureQuality = null,
  sharpness = null,
  faceSizeRatio = null,
  primaryBox = null,
  yaw = null,
  roll = null,
  brightness = null,
  identityConfidence = null,
  qualityScore = null,
  setRepresentative = false,
}) {
  const current = await readReferenceProfile({ familyId, userId });
  const existingIndex = assetId
    ? current.references.findIndex((reference) => reference.assetId === assetId)
    : -1;
  const reference = {
    id: existingIndex >= 0 ? current.references[existingIndex].id : uuid(),
    uri: uri || null,
    assetId: assetId || null,
    embedding: embedding || null,
    faceCount: faceCount || 1,
    capturedAt,
    ageAtCaptureDays: ageDaysAt(birthdayISO, capturedAt),
    source,
    weight,
    confirmedKeeps,
    confirmedSkips,
    parentConfirmed,
    captureQuality,
    sharpness,
    faceSizeRatio,
    primaryBox,
    yaw,
    roll,
    brightness,
    identityConfidence,
    qualityScore,
  };
  const references = existingIndex >= 0
    ? current.references.map((item, index) => (
      index === existingIndex
        ? {
          ...item,
          ...reference,
          confirmedKeeps: Number(item.confirmedKeeps || 0) + Number(confirmedKeeps || 0),
          confirmedSkips: Number(item.confirmedSkips || 0) + Number(confirmedSkips || 0),
          weight: Math.max(Number(item.weight || 1), Number(weight || 1)),
          parentConfirmed: Boolean(item.parentConfirmed || parentConfirmed),
        }
        : item
    ))
    : [...current.references, reference];
  const next = {
    ...current,
    references,
    representativeReferenceId: setRepresentative
      ? reference.id
      : current.representativeReferenceId,
  };
  return writeReferenceProfile({ familyId, userId, profile: next });
}

export async function saveAutoSeedReferences({
  familyId,
  userId,
  birthdayISO,
  references = [],
  representativeAssetId,
}) {
  const current = await readReferenceProfile({ familyId, userId });
  const retained = current.references.filter((reference) => reference.source !== 'auto-seed');
  const existingByAsset = new Map(current.references.map((reference) => [reference.assetId, reference]));
  const autoReferences = references.map((seed) => {
    const existing = existingByAsset.get(seed.assetId);
    return {
      id: existing?.id || uuid(),
      uri: seed.localUri || seed.uri || null,
      assetId: seed.assetId || null,
      embedding: seed.embedding || null,
      faceCount: seed.faceCount || 1,
      capturedAt: seed.creationTime || Date.now(),
      ageAtCaptureDays: ageDaysAt(birthdayISO, seed.creationTime || Date.now()),
      source: 'auto-seed',
      weight: 1,
      confirmedKeeps: existing?.confirmedKeeps || 0,
      confirmedSkips: existing?.confirmedSkips || 0,
      parentConfirmed: existing?.parentConfirmed || false,
      captureQuality: seed.captureQuality,
      sharpness: seed.sharpness,
      faceSizeRatio: seed.faceSizeRatio,
      primaryBox: seed.primaryBox,
      yaw: seed.yaw,
      roll: seed.roll,
      brightness: seed.brightness,
      identityConfidence: seed.identityConfidence,
      qualityScore: seed.qualityScore,
    };
  });
  const representative = autoReferences.find((reference) => reference.assetId === representativeAssetId);
  return writeReferenceProfile({
    familyId,
    userId,
    profile: {
      ...current,
      references: [...retained, ...autoReferences],
      representativeReferenceId: representative?.id || current.representativeReferenceId,
    },
  });
}

export async function confirmRepresentativeReference({ familyId, userId }) {
  const current = await readReferenceProfile({ familyId, userId });
  const references = current.references.map((reference) => (
    reference.id === current.representativeReferenceId
      ? { ...reference, parentConfirmed: true }
      : reference
  ));
  return writeReferenceProfile({ familyId, userId, profile: { ...current, references } });
}

export async function removeReferenceImage({ familyId, userId, referenceId, assetId }) {
  const current = await readReferenceProfile({ familyId, userId });
  return writeReferenceProfile({
    familyId,
    userId,
    profile: removeReferenceFromProfile(current, { referenceId, assetId }),
  });
}

export async function clearReferenceProfile({ familyId, userId }) {
  if (!familyId || !userId) return;
  await AsyncStorage.multiRemove([
    referenceStorageKey({ familyId, userId }),
    referenceSetStorageKey({ familyId, userId }),
    `olw:reference-set:v1:${familyId}:${userId}`,
  ]);
}

export async function clearAutoSeedReferences({ familyId, userId }) {
  const current = await readReferenceProfile({ familyId, userId });
  const references = current.references.filter((reference) => reference.source !== 'auto-seed');
  if (references.length === current.references.length) return current;
  return writeReferenceProfile({
    familyId,
    userId,
    profile: {
      ...current,
      references,
    },
  });
}

export function primaryReference(profile) {
  return representativeReference(normalizeProfile(profile));
}

export { representativeReference };

export async function addTrustedReferenceImage({
  familyId,
  userId,
  birthdayISO,
  match,
  embedding,
  faceCount,
}) {
  if (!match?.assetId || !embedding?.length) {
    return readReferenceProfile({ familyId, userId });
  }
  return addReferenceImage({
    familyId,
    userId,
    birthdayISO,
    uri: match.localUri || match.uri || null,
    assetId: match.assetId,
    embedding,
    faceCount: faceCount || match.faceCount || 1,
    capturedAt: match.creationTime || Date.now(),
    source: 'trusted-save',
    weight: Math.max(1.05, Math.min(1.2, 1 + Number(match.score || 0) * 0.18)),
    confirmedKeeps: 1,
    captureQuality: match.captureQuality,
    sharpness: match.sharpness,
    faceSizeRatio: match.faceSizeRatio,
    primaryBox: match.primaryBox,
    yaw: match.yaw,
    roll: match.roll,
    brightness: match.brightness,
    identityConfidence: match.score,
  });
}

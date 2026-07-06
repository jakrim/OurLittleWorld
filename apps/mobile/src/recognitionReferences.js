import AsyncStorage from '@react-native-async-storage/async-storage';

import { uuid } from './moments';

const VERSION = 'v1';
const MAX_REFERENCES = 12;
const MAX_SCORING_REFERENCES = 4;

export function referenceStorageKey({ familyId, userId }) {
  return `olw:reference:${familyId}:${userId}`;
}

export function referenceSetStorageKey({ familyId, userId }) {
  return `olw:reference-set:${VERSION}:${familyId}:${userId}`;
}

export function ageDaysAt(birthdayISO, capturedAtMs) {
  if (!birthdayISO || !capturedAtMs) return null;
  const birth = new Date(`${birthdayISO}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  return Math.floor((capturedAtMs - birth.getTime()) / 86400000);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function median(values) {
  const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return null;
  return nums[Math.floor(nums.length / 2)];
}

function normalizeProfile(profile) {
  const references = Array.isArray(profile?.references) ? profile.references : [];
  return {
    version: VERSION,
    references: references
      .filter((item) => item?.embedding?.length || item?.uri)
      .map((item) => ({
        id: item.id || uuid(),
        uri: item.uri || null,
        assetId: item.assetId || null,
        embedding: item.embedding || null,
        faceCount: item.faceCount || 1,
        capturedAt: item.capturedAt || Date.now(),
        ageAtCaptureDays: item.ageAtCaptureDays ?? null,
        source: item.source || 'seed',
        weight: clamp(Number(item.weight || 1), 0.65, 1.45),
        confirmedKeeps: Number(item.confirmedKeeps || 0),
        confirmedSkips: Number(item.confirmedSkips || 0),
      }))
      .slice(-MAX_REFERENCES),
    negativeExamples: Array.isArray(profile?.negativeExamples) ? profile.negativeExamples.slice(-80) : [],
    trust: profile?.trust || {},
    updatedAt: profile?.updatedAt || Date.now(),
  };
}

async function readLegacyReference({ familyId, userId }) {
  const raw = await AsyncStorage.getItem(referenceStorageKey({ familyId, userId }));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.embedding?.length && !parsed?.uri) return null;
    return {
      version: VERSION,
      references: [{
        id: uuid(),
        uri: parsed.uri || null,
        assetId: parsed.assetId || null,
        embedding: parsed.embedding || null,
        faceCount: parsed.faceCount || 1,
        capturedAt: parsed.capturedAt || Date.now(),
        ageAtCaptureDays: parsed.ageAtCaptureDays ?? null,
        source: 'legacy-reference',
        weight: 1,
        confirmedKeeps: 0,
        confirmedSkips: 0,
      }],
      negativeExamples: [],
      trust: {},
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function readReferenceProfile({ familyId, userId }) {
  if (!familyId || !userId) return normalizeProfile(null);
  const raw = await AsyncStorage.getItem(referenceSetStorageKey({ familyId, userId }));
  if (raw) {
    try {
      return normalizeProfile(JSON.parse(raw));
    } catch {}
  }
  const legacy = await readLegacyReference({ familyId, userId });
  if (!legacy) return normalizeProfile(null);
  await writeReferenceProfile({ familyId, userId, profile: legacy });
  return normalizeProfile(legacy);
}

export async function writeReferenceProfile({ familyId, userId, profile }) {
  if (!familyId || !userId) return normalizeProfile(profile);
  const normalized = normalizeProfile({ ...profile, updatedAt: Date.now() });
  await AsyncStorage.setItem(referenceSetStorageKey({ familyId, userId }), JSON.stringify(normalized));
  const primary = normalized.references[normalized.references.length - 1];
  if (primary) {
    await AsyncStorage.setItem(
      referenceStorageKey({ familyId, userId }),
      JSON.stringify({
        uri: primary.uri,
        assetId: primary.assetId,
        embedding: primary.embedding,
        faceCount: primary.faceCount,
        capturedAt: primary.capturedAt,
        ageAtCaptureDays: primary.ageAtCaptureDays,
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
    weight: clamp(weight, 0.65, 1.45),
    confirmedKeeps,
    confirmedSkips,
  };
  const references = existingIndex >= 0
    ? current.references.map((item, index) => (
      index === existingIndex
        ? {
          ...item,
          ...reference,
          confirmedKeeps: Number(item.confirmedKeeps || 0) + Number(confirmedKeeps || 0),
          confirmedSkips: Number(item.confirmedSkips || 0) + Number(confirmedSkips || 0),
          weight: clamp(Math.max(Number(item.weight || 1), Number(weight || 1)), 0.65, 1.45),
        }
        : item
    ))
    : [...current.references, reference];
  const next = {
    ...current,
    references: references.slice(-MAX_REFERENCES),
  };
  return writeReferenceProfile({ familyId, userId, profile: next });
}

export async function clearReferenceProfile({ familyId, userId }) {
  if (!familyId || !userId) return;
  await AsyncStorage.multiRemove([
    referenceStorageKey({ familyId, userId }),
    referenceSetStorageKey({ familyId, userId }),
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
  const refs = normalizeProfile(profile).references;
  return refs.length ? refs[refs.length - 1] : null;
}

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
    weight: clamp(1 + Number(match.score || 0) * 0.18, 1.05, 1.2),
    confirmedKeeps: 1,
  });
}

export function ageDaysForCandidate({ birthdayISO, creationTime }) {
  if (!birthdayISO || !creationTime) return null;
  return ageDaysAt(birthdayISO, Number(creationTime));
}

export function referenceWeightForCandidate(reference, candidateAgeDays) {
  const base = clamp(Number(reference?.weight || 1), 0.65, 1.45);
  const refAge = Number(reference?.ageAtCaptureDays);
  if (!Number.isFinite(refAge) || !Number.isFinite(candidateAgeDays)) return base;
  const diff = Math.abs(refAge - candidateAgeDays);
  const ageWeight =
    diff <= 30 ? 1.14
      : diff <= 90 ? 1.08
        : diff <= 180 ? 1
          : diff <= 365 ? 0.92
            : 0.84;
  return clamp(base * ageWeight, 0.65, 1.45);
}

export function selectReferencesForCandidates(profile, { birthdayISO, candidates = [], limit = MAX_SCORING_REFERENCES } = {}) {
  const refs = normalizeProfile(profile).references.filter((reference) => reference?.embedding?.length);
  if (refs.length <= limit) return refs;
  const candidateAges = (candidates || [])
    .map((candidate) => ageDaysForCandidate({ birthdayISO, creationTime: candidate.creationTime }))
    .filter((value) => Number.isFinite(value));
  const targetAge = median(candidateAges);
  const latestId = refs[refs.length - 1]?.id;

  return refs
    .map((reference, index) => {
      const refAge = Number(reference.ageAtCaptureDays);
      const ageDistance = Number.isFinite(targetAge) && Number.isFinite(refAge)
        ? Math.abs(targetAge - refAge)
        : 365;
      const ageScore = Math.max(0, 1 - ageDistance / 540);
      const keepScore = Math.min(0.25, Number(reference.confirmedKeeps || 0) * 0.04);
      const recencyScore = (index / Math.max(1, refs.length - 1)) * 0.18;
      const primaryBoost = reference.id === latestId ? 0.2 : 0;
      return {
        reference,
        score: Number(reference.weight || 1) + ageScore + keepScore + recencyScore + primaryBoost,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.reference);
}

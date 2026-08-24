import { autoSeedQualityScore } from './referenceAutoSeedModel.js';

export const REFERENCE_PROFILE_VERSION = 'v2';
export const MAX_REFERENCES = 12;
export const MAX_SCORING_REFERENCES = 4;
export const REFERENCE_SUPPORT_SCORE = 0.68;
export const SINGLE_CONFIRMED_REFERENCE_SCORE = 0.7;
export const SINGLE_UNCONFIRMED_REFERENCE_SCORE = 0.84;
export const STRONG_REPRESENTATIVE_SCORE = 0.86;

export function ageDaysAt(birthdayISO, capturedAtMs) {
  if (!birthdayISO || !capturedAtMs) return null;
  const birth = new Date(`${birthdayISO}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  return Math.floor((capturedAtMs - birth.getTime()) / 86400000);
}

export function normalizeReferenceProfile(profile, { makeId } = {}) {
  const references = Array.isArray(profile?.references) ? profile.references : [];
  const normalizedReferences = references
    .filter((item) => item?.embedding?.length || item?.uri)
    .map((item, index) => normalizeReference(item, index, makeId));
  const requestedRepresentativeId = String(profile?.representativeReferenceId || '');
  const representative = chooseRepresentativeReference(
    normalizedReferences,
    requestedRepresentativeId,
  );
  const trimmed = trimReferenceSet(
    normalizedReferences,
    MAX_REFERENCES,
    representative?.id || null,
  );
  const retainedRepresentative = chooseRepresentativeReference(
    trimmed,
    representative?.id || null,
  );

  return {
    version: REFERENCE_PROFILE_VERSION,
    references: trimmed,
    representativeReferenceId: retainedRepresentative?.id || null,
    negativeExamples: Array.isArray(profile?.negativeExamples) ? profile.negativeExamples.slice(-80) : [],
    trust: profile?.trust || {},
    updatedAt: profile?.updatedAt || Date.now(),
  };
}

export function chooseRepresentativeReference(references, requestedId = null) {
  const list = (references || []).filter((reference) => reference?.embedding?.length || reference?.uri);
  if (!list.length) return null;
  const requested = requestedId
    ? list.find((reference) => reference.id === requestedId)
    : null;
  if (requested) return requested;

  return [...list].sort((a, b) => {
    const confirmedDiff = Number(Boolean(b.parentConfirmed)) - Number(Boolean(a.parentConfirmed));
    if (confirmedDiff) return confirmedDiff;
    const keepDiff = Number(b.confirmedKeeps || 0) - Number(a.confirmedKeeps || 0);
    if (keepDiff) return keepDiff;
    const qualityDiff = referenceQuality(b) - referenceQuality(a);
    if (qualityDiff) return qualityDiff;
    const sourceDiff = sourceTrust(b.source) - sourceTrust(a.source);
    if (sourceDiff) return sourceDiff;
    const identityDiff = referenceIdentity(b) - referenceIdentity(a);
    if (identityDiff) return identityDiff;
    return stableReferenceKey(a).localeCompare(stableReferenceKey(b));
  })[0];
}

export function representativeReference(profile) {
  const normalized = normalizeReferenceProfile(profile);
  return normalized.references.find(
    (reference) => reference.id === normalized.representativeReferenceId,
  ) || null;
}

export function removeReferenceFromProfile(profile, { referenceId, assetId } = {}) {
  const normalized = normalizeReferenceProfile(profile);
  const references = normalized.references.filter((reference) => {
    if (referenceId && reference.id === referenceId) return false;
    if (assetId && reference.assetId === assetId) return false;
    return true;
  });
  return normalizeReferenceProfile({
    ...normalized,
    references,
    representativeReferenceId: references.some(
      (reference) => reference.id === normalized.representativeReferenceId,
    )
      ? normalized.representativeReferenceId
      : null,
  });
}

export function ageDaysForCandidate({ birthdayISO, creationTime }) {
  if (!birthdayISO || !creationTime) return null;
  return ageDaysAt(birthdayISO, Number(creationTime));
}

export function referenceWeightForCandidate(reference, candidateAgeDays) {
  const quality = referenceQuality(reference);
  const approval = referenceApproval(reference);
  const identity = referenceIdentity(reference);
  const trusted = sourceTrust(reference?.source);
  const refAge = finite(reference?.ageAtCaptureDays);
  const ageAffinity = Number.isFinite(refAge) && Number.isFinite(candidateAgeDays)
    ? ageAffinityForDistance(Math.abs(refAge - candidateAgeDays))
    : 0.9;
  const base = 0.86
    + quality * 0.1
    + approval * 0.08
    + identity * 0.05
    + trusted * 0.03;
  return clamp(base * ageAffinity, 0.78, 1.24);
}

export function selectReferencesForCandidates(
  profile,
  { birthdayISO, candidates = [], limit = MAX_SCORING_REFERENCES } = {},
) {
  const refs = normalizeReferenceProfile(profile).references
    .filter((reference) => reference?.embedding?.length);
  if (refs.length <= limit) return [...refs].sort(compareStableReference);

  const candidateAges = (candidates || [])
    .map((candidate) => ageDaysForCandidate({ birthdayISO, creationTime: candidate.creationTime }))
    .filter((value) => Number.isFinite(value));
  const targetAge = median(candidateAges);
  const remaining = [...refs];
  const selected = [];

  while (remaining.length && selected.length < limit) {
    remaining.sort((a, b) => {
      const scoreDiff = referenceSelectionScore(b, targetAge, selected)
        - referenceSelectionScore(a, targetAge, selected);
      if (scoreDiff) return scoreDiff;
      return compareStableReference(a, b);
    });
    selected.push(remaining.shift());
  }

  return selected;
}

/**
 * Turn per-reference face scores into one conservative identity decision.
 *
 * A single learned reference is never allowed to admit a candidate on its
 * own unless it is the photo a parent explicitly confirmed (or is an
 * exceptionally strong match). With multiple references, at least two must
 * agree. This prevents one polluted reference or an age/quality boost from
 * turning an unrelated face into a surfaced family memory.
 */
export function aggregateReferenceMatches({
  entries = [],
  representativeReferenceId = null,
} = {}) {
  const rows = entries
    .filter((entry) => entry?.reference && entry?.result)
    .map((entry) => ({
      ...entry,
      rawScore: clamp(Number(entry.result.score || 0), 0, 1),
    }));
  if (!rows.length) return rejectedReferenceMatch();

  const representative = rows.find(
    (entry) => entry.reference.id === representativeReferenceId,
  ) || null;
  const confirmedRepresentative = representative?.reference?.parentConfirmed
    ? representative
    : null;

  if (rows.length === 1) {
    const [only] = rows;
    const minimum = only.reference.parentConfirmed
      ? SINGLE_CONFIRMED_REFERENCE_SCORE
      : SINGLE_UNCONFIRMED_REFERENCE_SCORE;
    if (only.rawScore < minimum) return rejectedReferenceMatch(only);
    return acceptedReferenceMatch([only], only);
  }

  const support = rows
    .filter((entry) => entry.rawScore >= REFERENCE_SUPPORT_SCORE)
    .sort(compareReferenceMatch);

  if (confirmedRepresentative) {
    const otherSupport = support.filter(
      (entry) => entry.reference.id !== confirmedRepresentative.reference.id,
    );
    const representativeIsStrongEnough = confirmedRepresentative.rawScore >= REFERENCE_SUPPORT_SCORE;
    const representativeCanStandAlone = confirmedRepresentative.rawScore >= STRONG_REPRESENTATIVE_SCORE;
    if (!representativeIsStrongEnough || (!otherSupport.length && !representativeCanStandAlone)) {
      return rejectedReferenceMatch(confirmedRepresentative);
    }
    const agreeing = otherSupport.length
      ? [confirmedRepresentative, otherSupport[0]]
      : [confirmedRepresentative];
    return acceptedReferenceMatch(agreeing, [...rows].sort(compareReferenceMatch)[0]);
  }

  if (support.length < 2) return rejectedReferenceMatch(support[0] || [...rows].sort(compareReferenceMatch)[0]);
  return acceptedReferenceMatch(support.slice(0, 2), [...rows].sort(compareReferenceMatch)[0]);
}

export function selectExplicitReferenceLearningCandidates(
  matches = [],
  explicitlyConfirmedAssetIds = new Set(),
  { minimumScore = 0.82 } = {},
) {
  const confirmed = explicitlyConfirmedAssetIds instanceof Set
    ? explicitlyConfirmedAssetIds
    : new Set(explicitlyConfirmedAssetIds || []);
  return (matches || []).filter((match) => (
    confirmed.has(match?.assetId)
    && Number(match?.score || 0) >= minimumScore
    && Number(match?.faceCount || 0) > 0
    && Boolean(match?.localUri || match?.uri)
  ));
}

export function referenceSelectionScore(reference, targetAge, selected = []) {
  const refAge = finite(reference?.ageAtCaptureDays);
  const ageScore = Number.isFinite(refAge) && Number.isFinite(targetAge)
    ? Math.max(0, 1 - Math.abs(refAge - targetAge) / 540)
    : 0.5;
  const diversityScore = selected.length && Number.isFinite(refAge)
    ? Math.min(1, Math.min(...selected.map((item) => {
      const selectedAge = finite(item?.ageAtCaptureDays);
      return Number.isFinite(selectedAge) ? Math.abs(selectedAge - refAge) : 0;
    })) / 180)
    : 0;
  const keepScore = Math.min(1, Number(reference?.confirmedKeeps || 0) / 4);
  return ageScore * 0.42
    + referenceQuality(reference) * 0.24
    + referenceApproval(reference) * 0.14
    + referenceIdentity(reference) * 0.08
    + sourceTrust(reference?.source) * 0.04
    + keepScore * 0.03
    + diversityScore * 0.05;
}

function normalizeReference(item, index, makeId) {
  const capturedAt = finite(item.capturedAt) || Date.now();
  const id = item.id || makeId?.() || `reference:${item.assetId || capturedAt}:${index}`;
  return {
    id,
    uri: item.uri || null,
    assetId: item.assetId || null,
    embedding: item.embedding || null,
    faceCount: finite(item.faceCount) || 1,
    capturedAt,
    ageAtCaptureDays: finite(item.ageAtCaptureDays),
    source: item.source || 'seed',
    weight: clamp(finite(item.weight) || 1, 0.65, 1.45),
    confirmedKeeps: finite(item.confirmedKeeps) || 0,
    confirmedSkips: finite(item.confirmedSkips) || 0,
    parentConfirmed: Boolean(item.parentConfirmed),
    captureQuality: finite(item.captureQuality),
    sharpness: finite(item.sharpness),
    faceSizeRatio: finite(item.faceSizeRatio),
    primaryBox: normalizeBox(item.primaryBox),
    yaw: finite(item.yaw),
    roll: finite(item.roll),
    brightness: finite(item.brightness),
    identityConfidence: finite(item.identityConfidence),
    qualityScore: finite(item.qualityScore),
  };
}

function trimReferenceSet(references, limit, representativeId) {
  if (references.length <= limit) return [...references];
  const chronological = [...references].sort((a, b) => (
    Number(a.ageAtCaptureDays ?? a.capturedAt ?? 0)
    - Number(b.ageAtCaptureDays ?? b.capturedAt ?? 0)
  ) || compareStableReference(a, b));
  const selected = evenlySpaced(chronological, limit);
  const representative = chronological.find((reference) => reference.id === representativeId);
  if (representative && !selected.some((reference) => reference.id === representative.id)) {
    let replaceIndex = selected.length - 1;
    let closestDistance = Infinity;
    for (let index = 1; index < selected.length - 1; index += 1) {
      const distance = Math.abs(
        Number(selected[index].ageAtCaptureDays ?? selected[index].capturedAt ?? 0)
        - Number(representative.ageAtCaptureDays ?? representative.capturedAt ?? 0),
      );
      if (distance < closestDistance) {
        closestDistance = distance;
        replaceIndex = index;
      }
    }
    selected[replaceIndex] = representative;
  }
  return Array.from(new Map(selected.map((reference) => [reference.id, reference])).values())
    .sort((a, b) => Number(a.capturedAt || 0) - Number(b.capturedAt || 0));
}

function referenceQuality(reference) {
  const explicit = finite(reference?.qualityScore);
  if (explicit != null) return clamp(explicit, 0, 1);
  const measured = autoSeedQualityScore({
    ...reference,
    localUri: reference?.uri || 'persisted-local-reference',
    identityConfidence: referenceIdentity(reference),
  });
  return measured || 0.5;
}

function referenceApproval(reference) {
  if (reference?.parentConfirmed) return 1;
  if (Number(reference?.confirmedKeeps || 0) > 0) return 0.9;
  return 0;
}

function referenceIdentity(reference) {
  return clamp(finite(reference?.identityConfidence) ?? 0.5, 0, 1);
}

function sourceTrust(source) {
  if (source === 'trusted-save') return 1;
  if (source === 'seed' || source === 'legacy-reference' || source === 'existing-reference') return 0.7;
  if (source === 'auto-seed') return 0.35;
  return 0.5;
}

function acceptedReferenceMatch(agreeing, best) {
  const score = agreeing.reduce((sum, entry) => sum + entry.rawScore, 0) / agreeing.length;
  return {
    passed: true,
    score,
    supportCount: agreeing.length,
    bestEntry: best || agreeing[0] || null,
    rawScores: agreeing.map((entry) => entry.rawScore),
  };
}

function rejectedReferenceMatch(bestEntry = null) {
  return {
    passed: false,
    score: 0,
    supportCount: 0,
    bestEntry,
    rawScores: [],
  };
}

function compareReferenceMatch(a, b) {
  return b.rawScore - a.rawScore
    || stableReferenceKey(a.reference).localeCompare(stableReferenceKey(b.reference));
}

function ageAffinityForDistance(diff) {
  if (diff <= 30) return 1.1;
  if (diff <= 90) return 1.06;
  if (diff <= 180) return 1;
  if (diff <= 365) return 0.94;
  return 0.88;
}

function normalizeBox(box) {
  if (!box) return null;
  const x = finite(box.x);
  const y = finite(box.y);
  const w = finite(box.w);
  const h = finite(box.h);
  return [x, y, w, h].every((value) => value != null) ? { x, y, w, h } : null;
}

function compareStableReference(a, b) {
  return stableReferenceKey(a).localeCompare(stableReferenceKey(b));
}

function stableReferenceKey(reference) {
  return String(reference?.assetId || reference?.id || reference?.capturedAt || '');
}

function evenlySpaced(items, limit) {
  if (items.length <= limit) return [...items];
  if (limit <= 1) return items.length ? [items[0]] : [];
  const selected = [];
  const seen = new Set();
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.round((index * (items.length - 1)) / (limit - 1));
    if (seen.has(sourceIndex)) continue;
    seen.add(sourceIndex);
    selected.push(items[sourceIndex]);
  }
  return selected;
}

function median(values) {
  const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return null;
  return nums[Math.floor(nums.length / 2)];
}

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

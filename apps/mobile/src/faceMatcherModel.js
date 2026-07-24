import {
  aggregateReferenceMatches,
  ageDaysForCandidate,
  referenceWeightForCandidate,
  selectReferencesForCandidates,
} from './recognitionReferenceModel.js';

export const DEFAULT_NATIVE_MATCH_BATCH_TIMEOUT_MS = 60_000;
export const FIRST_VALUE_NATIVE_MATCH_BATCH_TIMEOUT_MS = 8_000;
export const MIN_NATIVE_MATCH_BATCH_TIMEOUT_MS = 4_000;
export const MAX_NATIVE_MATCH_BATCH_TIMEOUT_MS = 90_000;

export function resolveNativeMatchBatchTimeout(value, fallback = DEFAULT_NATIVE_MATCH_BATCH_TIMEOUT_MS) {
  const parsed = Number(value);
  const resolved = Number.isFinite(parsed) ? parsed : Number(fallback);
  return Math.max(
    MIN_NATIVE_MATCH_BATCH_TIMEOUT_MS,
    Math.min(MAX_NATIVE_MATCH_BATCH_TIMEOUT_MS, Math.round(resolved)),
  );
}

export function selectMatchReferences({
  profile,
  birthdayISO,
  candidates,
  fallbackReference,
  referenceLimit,
} = {}) {
  const selected = selectReferencesForCandidates(profile, {
    birthdayISO,
    candidates,
    limit: referenceLimit,
  });
  const references = selected.length
    ? selected
    : (fallbackReference?.embedding?.length ? [fallbackReference] : []);
  return references.map((reference, index) => ({
    ...reference,
    id: String(reference.id || reference.referenceId || `fallback-${index + 1}`),
  }));
}

export function mergeMultiReferenceMatches({
  profile,
  birthdayISO,
  candidates = [],
  references = [],
  results = [],
} = {}) {
  const byCandidate = new Map(candidates.map((candidate) => [candidate.assetId, candidate]));
  const byReference = new Map(references.map((reference) => [String(reference.id), reference]));
  const entriesById = new Map(candidates.map((candidate) => [candidate.assetId, []]));

  for (const result of results || []) {
    const candidate = byCandidate.get(result?.assetId);
    const reference = byReference.get(String(result?.referenceId || ''));
    if (!candidate || !reference) continue;
    const candidateAge = ageDaysForCandidate({
      birthdayISO,
      creationTime: candidate.creationTime,
    });
    entriesById.get(candidate.assetId)?.push({
      reference,
      result,
      ageWeight: referenceWeightForCandidate(reference, candidateAge),
    });
  }

  const representativeReferenceId = String(
    profile?.representativeReferenceId
      || references.find((reference) => reference.parentConfirmed)?.id
      || references[0]?.id
      || '',
  );

  return candidates.map((candidate) => {
    const consensus = aggregateReferenceMatches({
      entries: entriesById.get(candidate.assetId),
      representativeReferenceId,
    });
    const best = consensus.bestEntry;
    return {
      ...(best?.result || emptyMatch(candidate.assetId)),
      rawScore: best?.rawScore ?? Number(best?.result?.score || 0),
      score: consensus.score,
      identityConsensusPassed: consensus.passed,
      identitySupportCount: consensus.supportCount,
      referenceId: best?.reference?.id || null,
      referenceSource: best?.reference?.source || null,
      ageWeight: best?.ageWeight ?? 1,
    };
  }).sort((a, b) => b.score - a.score);
}

export function nativeReferenceInputs(references = []) {
  return references
    .filter((reference) => reference?.embedding?.length)
    .map((reference) => ({
      referenceId: String(reference.id),
      embedding: reference.embedding,
    }));
}

function emptyMatch(assetId) {
  return {
    assetId,
    score: 0,
    faceCount: 0,
    captureQuality: null,
    faceSizeRatio: null,
    sharpness: null,
    yaw: null,
    roll: null,
    brightness: null,
    featureVector: null,
    visualFingerprint: null,
  };
}

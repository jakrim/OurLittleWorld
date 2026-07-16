import {
  PHOTO_STACK_FALLBACK_BURST_GAP_MS,
  PHOTO_STACK_NEAR_DUPLICATE_DISTANCE,
  PHOTO_STACK_SESSION_GAP_MS,
  featureDistance,
  qualityValue,
} from './photoStackModel.js';

export const BEST_PHOTO_MIN_IDENTITY_SCORE = 0.62;
export const BEST_PHOTO_DEFAULT_LIMIT = 12;

export function buildBestPhotoCandidateSet(candidates = [], {
  limit = BEST_PHOTO_DEFAULT_LIMIT,
  minIdentityScore = BEST_PHOTO_MIN_IDENTITY_SCORE,
  requireLikelyChild = true,
  nearDuplicateDistance = PHOTO_STACK_NEAR_DUPLICATE_DISTANCE,
  sessionGapMs = PHOTO_STACK_SESSION_GAP_MS,
  fallbackBurstGapMs = PHOTO_STACK_FALLBACK_BURST_GAP_MS,
} = {}) {
  const seen = new Set();
  const eligible = [];

  for (const candidate of candidates || []) {
    const assetId = candidateId(candidate);
    if (!assetId || seen.has(assetId) || isVideo(candidate)) continue;
    seen.add(assetId);
    const score = finiteOrNull(candidate?.score);
    if (requireLikelyChild && (score == null || score < minIdentityScore)) continue;
    eligible.push(candidate);
  }

  const ranked = eligible.sort(compareBestPhoto);
  const photos = [];
  let suppressedCount = 0;
  for (const candidate of ranked) {
    if (photos.some((kept) => areLookalikes(candidate, kept, {
      nearDuplicateDistance,
      sessionGapMs,
      fallbackBurstGapMs,
    }))) {
      suppressedCount += 1;
      continue;
    }
    if (photos.length < Math.max(0, Number(limit || 0))) photos.push(candidate);
  }

  return {
    photos,
    analyzedCount: eligible.length,
    suppressedCount,
  };
}

export function areLookalikes(a, b, {
  nearDuplicateDistance = PHOTO_STACK_NEAR_DUPLICATE_DISTANCE,
  sessionGapMs = PHOTO_STACK_SESSION_GAP_MS,
  fallbackBurstGapMs = PHOTO_STACK_FALLBACK_BURST_GAP_MS,
} = {}) {
  const timeGap = Math.abs(candidateTime(a) - candidateTime(b));
  if (timeGap > sessionGapMs) return false;
  const distance = featureDistance(a, b);
  if (Number.isFinite(distance) && distance !== Infinity) {
    return distance <= nearDuplicateDistance;
  }
  return timeGap <= fallbackBurstGapMs;
}

export function candidateId(candidate) {
  return candidate?.assetId || candidate?.asset_id || candidate?.id || null;
}

function compareBestPhoto(a, b) {
  return qualityValue(b) - qualityValue(a)
    || Number(b?.score || 0) - Number(a?.score || 0)
    || candidateTime(b) - candidateTime(a)
    || String(candidateId(a) || '').localeCompare(String(candidateId(b) || ''));
}

function candidateTime(candidate) {
  const raw = candidate?.creationTime ?? candidate?.creation_time ?? candidate?.createdAt;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const parsed = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function isVideo(candidate) {
  return String(candidate?.mediaType || candidate?.type || '').toLowerCase() === 'video';
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

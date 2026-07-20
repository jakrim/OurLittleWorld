import { compareCandidateStrength, SELECTION_REASONS } from './candidateLedgerModel.js';

export const NIGHTLY_QUEUE_MIN = 3;
export const NIGHTLY_QUEUE_MAX = 7;
export const NIGHTLY_QUEUE_RECENT_TARGET = 3;
export const NIGHTLY_QUEUE_HISTORICAL_TARGET = 3;
export const NIGHTLY_QUEUE_RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;
export const NIGHTLY_QUEUE_QUALITY_FLOOR = 0.25;
export const NIGHTLY_QUEUE_IDENTITY_FLOOR = 0.75;
export const NIGHTLY_QUEUE_GENERATION_VERSION = 'nightly-queue-v1';

export function buildNightlyQueue(candidates = [], {
  nowMs = Date.now(),
  seed = localDayFromMs(nowMs),
  maxItems = NIGHTLY_QUEUE_MAX,
} = {}) {
  const unique = uniqueEligible(candidates).filter((candidate) => meetsQualityFloor(candidate));
  const ranked = unique.sort((a, b) => compareQueueCandidate(a, b, seed));
  const recentCutoff = nowMs - NIGHTLY_QUEUE_RECENT_WINDOW_MS;
  const recent = ranked.filter((candidate) => Number(candidate.captureTimeMs || 0) >= recentCutoff);
  const historical = ranked.filter((candidate) => Number(candidate.captureTimeMs || 0) < recentCutoff);
  const chosen = [];
  const usedAssets = new Set();
  const usedClusters = new Set();

  addLane(chosen, recent, Math.min(NIGHTLY_QUEUE_RECENT_TARGET, maxItems), { usedAssets, usedClusters, seed });
  addLane(chosen, historical, Math.min(NIGHTLY_QUEUE_HISTORICAL_TARGET, maxItems - chosen.length), { usedAssets, usedClusters, seed });

  const video = ranked.find((candidate) => candidate.mediaType === 'video'
    && qualifyingVideo(candidate)
    && !usedAssets.has(candidate.assetId)
    && !usedClusters.has(candidate.eventClusterKey));
  if (video && chosen.length < maxItems) addCandidate(chosen, video, { usedAssets, usedClusters, seed });

  addLane(chosen, ranked, maxItems - chosen.length, { usedAssets, usedClusters, seed });

  return chosen
    .slice(0, maxItems)
    .map((candidate, position) => ({
      assetId: candidate.assetId,
      position,
      reasonCode: reasonFor(candidate, chosen),
      reasonLabel: SELECTION_REASONS[reasonFor(candidate, chosen)],
    }));
}

export function parentReasonLabel(reasonCode) {
  return SELECTION_REASONS[reasonCode] || SELECTION_REASONS.distinct_standout;
}

function uniqueEligible(candidates) {
  const byAsset = new Map();
  for (const candidate of candidates || []) {
    if (!candidate?.assetId || candidate.lifecycleState !== 'eligible' || candidate.availability !== 'available') continue;
    const current = byAsset.get(candidate.assetId);
    if (!current || compareCandidateStrength(candidate, current) < 0) byAsset.set(candidate.assetId, candidate);
  }
  return [...byAsset.values()];
}

function meetsQualityFloor(candidate) {
  if (Number(candidate.identityScore || 0) < NIGHTLY_QUEUE_IDENTITY_FLOOR) return false;
  if (candidate.mediaType === 'video') return qualifyingVideo(candidate);
  return Number(candidate.captureQuality ?? candidate.qualityScore ?? 0) >= NIGHTLY_QUEUE_QUALITY_FLOOR;
}

function qualifyingVideo(candidate) {
  const duration = Number(candidate.durationSec || 0);
  const presence = Number(candidate.videoPresenceRatio || 0);
  const quality = Number(candidate.captureQuality ?? candidate.qualityScore ?? 0);
  return duration >= 2 && quality >= NIGHTLY_QUEUE_QUALITY_FLOOR
    && (presence >= 0.66 || Number(candidate.identityScore || 0) >= 0.9);
}

function addLane(chosen, lane, limit, context) {
  if (limit <= 0) return;
  for (const candidate of lane) {
    if (chosen.length >= NIGHTLY_QUEUE_MAX || limit <= 0) break;
    if (!canAdd(candidate, context)) continue;
    addCandidate(chosen, candidate, context);
    limit -= 1;
  }
}

function canAdd(candidate, { usedAssets, usedClusters }) {
  if (usedAssets.has(candidate.assetId)) return false;
  if (candidate.eventClusterKey && usedClusters.has(candidate.eventClusterKey)) return false;
  return true;
}

function addCandidate(chosen, candidate, { usedAssets, usedClusters }) {
  chosen.push(candidate);
  usedAssets.add(candidate.assetId);
  if (candidate.eventClusterKey) usedClusters.add(candidate.eventClusterKey);
}

function reasonFor(candidate, chosen) {
  if (candidate.selectionReasonCode === 'parent_pick') return 'parent_pick';
  if (candidate.mediaType === 'video') return 'clear_video';
  if (Number(candidate.clusterMemberCount || 1) > 1) return 'best_burst';
  const sameDay = chosen.filter((item) => item.localDay && item.localDay === candidate.localDay);
  if (sameDay.length > 1) return 'distinct_standout';
  return candidate.selectionReasonCode === 'first_year_coverage' ? 'first_year_coverage' : 'best_day';
}

function compareQueueCandidate(a, b, seed) {
  return Number(b.coverageNeeded === true) - Number(a.coverageNeeded === true)
    || Number(b.mediaType === 'video' && qualifyingVideo(b)) - Number(a.mediaType === 'video' && qualifyingVideo(a))
    || compareCandidateStrength(a, b)
    || stableHash(`${seed}:${a.assetId}`) - stableHash(`${seed}:${b.assetId}`)
    || String(a.assetId).localeCompare(String(b.assetId));
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function localDayFromMs(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

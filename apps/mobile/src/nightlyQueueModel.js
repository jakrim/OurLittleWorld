import { compareCandidateStrength, SELECTION_REASONS } from './candidateLedgerModel.js';
import {
  featureDistance,
  PHOTO_STACK_NEAR_DUPLICATE_DISTANCE,
  PHOTO_STACK_SESSION_GAP_MS,
} from './photoStackModel.js';

export const NIGHTLY_QUEUE_MIN = 3;
export const NIGHTLY_QUEUE_MAX = 7;
export const NIGHTLY_QUEUE_RECENT_TARGET = 3;
export const NIGHTLY_QUEUE_HISTORICAL_TARGET = 3;
export const NIGHTLY_QUEUE_RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;
// Physical-device review showed that the former permissive floor allowed a
// polished adult-only false positive into an upgraded user's stale queue. The
// default lane should be smaller before it is noisier.
export const NIGHTLY_QUEUE_QUALITY_FLOOR = 0.5;
export const NIGHTLY_QUEUE_STANDOUT_FLOOR = 0.55;
export const NIGHTLY_QUEUE_IDENTITY_FLOOR = 0.82;
export const NIGHTLY_QUEUE_GENERATION_VERSION = 'nightly-queue-v2';

export function buildNightlyQueue(candidates = [], {
  nowMs = Date.now(),
  seed = localDayFromMs(nowMs),
  maxItems = NIGHTLY_QUEUE_MAX,
} = {}) {
  const queueLimit = Math.max(0, Math.min(NIGHTLY_QUEUE_MAX, Number(maxItems || 0)));
  if (!queueLimit) return [];
  const unique = uniqueEligible(candidates).filter((candidate) => meetsNightlyQueueQuality(candidate));
  const ranked = unique.sort((a, b) => compareQueueCandidate(a, b, seed));
  const dailyAnchors = strongestPerLocalDay(ranked).sort((a, b) => compareQueueCandidate(a, b, seed));
  const anchorAssetIds = new Set(dailyAnchors.map((candidate) => candidate.assetId));
  const recentCutoff = nowMs - NIGHTLY_QUEUE_RECENT_WINDOW_MS;
  const recentAnchors = dailyAnchors.filter((candidate) => Number(candidate.captureTimeMs || 0) >= recentCutoff);
  const historicalAnchors = dailyAnchors.filter((candidate) => Number(candidate.captureTimeMs || 0) < recentCutoff);
  const specialVideo = ranked.find((candidate) => candidate.mediaType === 'video' && qualifyingVideo(candidate));
  const reserveVideo = specialVideo ? 1 : 0;
  const anchorSlots = Math.max(0, queueLimit - reserveVideo);
  const recentTarget = Math.min(
    NIGHTLY_QUEUE_RECENT_TARGET,
    anchorSlots <= 2 ? 1 : Math.ceil(anchorSlots / 2),
  );
  const historicalTarget = Math.min(NIGHTLY_QUEUE_HISTORICAL_TARGET, Math.max(0, anchorSlots - recentTarget));
  const chosen = [];
  const usedAssets = new Set();
  const usedClusters = new Set();

  addLane(chosen, recentAnchors, recentTarget, { usedAssets, usedClusters });
  addLane(chosen, historicalAnchors, historicalTarget, { usedAssets, usedClusters });

  if (specialVideo && chosen.length < queueLimit && canAdd(specialVideo, { usedAssets, usedClusters, chosen })) {
    addCandidate(chosen, specialVideo, { usedAssets, usedClusters });
  }

  // Fill missing anchor lanes before considering a second item from a day. This
  // keeps calendar coverage independent of scan order while still allowing
  // distinct standouts when there is room.
  addLane(chosen, dailyAnchors, queueLimit - chosen.length, { usedAssets, usedClusters });
  const standouts = ranked.filter((candidate) => (
    !anchorAssetIds.has(candidate.assetId)
    && (candidate.mediaType === 'video'
      ? qualifyingVideo(candidate)
      : Number(candidate.captureQuality ?? candidate.qualityScore ?? 0) >= NIGHTLY_QUEUE_STANDOUT_FLOOR)
  ));
  addLane(chosen, standouts, queueLimit - chosen.length, { usedAssets, usedClusters });

  return chosen.slice(0, queueLimit).map((candidate, position) => {
    const reasonCode = reasonFor(candidate, chosen, anchorAssetIds);
    return {
      assetId: candidate.assetId,
      position,
      reasonCode,
      reasonLabel: SELECTION_REASONS[reasonCode],
    };
  });
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

function strongestPerLocalDay(candidates) {
  const byDay = new Map();
  for (const candidate of candidates) {
    const key = candidate.localDay || `undated:${candidate.assetId}`;
    const current = byDay.get(key);
    if (!current || compareCandidateStrength(candidate, current) < 0) byDay.set(key, candidate);
  }
  return [...byDay.values()];
}

export function meetsNightlyQueueQuality(candidate) {
  if (Number(candidate.identityScore || 0) < NIGHTLY_QUEUE_IDENTITY_FLOOR) return false;
  if (candidate.mediaType === 'video') return qualifyingVideo(candidate);
  return Number(candidate.captureQuality ?? candidate.qualityScore ?? 0) >= NIGHTLY_QUEUE_QUALITY_FLOOR;
}

export function shouldWithdrawStaleNightlyItem(item) {
  if (item?.reasonCode === 'parent_pick') return false;
  if (item?.commitState && item.commitState !== 'idle') return false;
  if (String(item?.draftText || '').trim()) return false;
  if (item?.parentInteracted === true) return false;
  if ((item?.enrichmentStates || []).some((state) => ['saving', 'saved', 'failed'].includes(state))) return false;
  return !meetsNightlyQueueQuality(item);
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
    if (!canAdd(candidate, { ...context, chosen })) continue;
    addCandidate(chosen, candidate, context);
    limit -= 1;
  }
}

function canAdd(candidate, { usedAssets, usedClusters, chosen = [] }) {
  if (usedAssets.has(candidate.assetId)) return false;
  if (candidate.eventClusterKey && usedClusters.has(candidate.eventClusterKey)) return false;
  if (candidate.mediaType !== 'video' && chosen.some((selected) => isPersistedLookalike(candidate, selected))) return false;
  return true;
}

function isPersistedLookalike(a, b) {
  if (b.mediaType === 'video') return false;
  const timeGap = Math.abs(Number(a.captureTimeMs || 0) - Number(b.captureTimeMs || 0));
  if (timeGap > PHOTO_STACK_SESSION_GAP_MS) return false;
  const distance = featureDistance(a, b);
  return Number.isFinite(distance) && distance <= PHOTO_STACK_NEAR_DUPLICATE_DISTANCE;
}

function addCandidate(chosen, candidate, { usedAssets, usedClusters }) {
  chosen.push(candidate);
  usedAssets.add(candidate.assetId);
  if (candidate.eventClusterKey) usedClusters.add(candidate.eventClusterKey);
}

function reasonFor(candidate, chosen, anchorAssetIds) {
  if (candidate.selectionReasonCode === 'parent_pick') return 'parent_pick';
  if (candidate.mediaType === 'video') return 'clear_video';
  if (Number(candidate.clusterMemberCount || 1) > 1) return 'best_burst';
  if (!anchorAssetIds.has(candidate.assetId)) return 'distinct_standout';
  const sameDay = chosen.filter((item) => item.localDay && item.localDay === candidate.localDay);
  if (sameDay.length > 1 && chosen.indexOf(candidate) > chosen.findIndex((item) => item.localDay === candidate.localDay)) {
    return 'distinct_standout';
  }
  return candidate.selectionReasonCode === 'first_year_coverage' && candidate.coverageNeeded !== false
    ? 'first_year_coverage'
    : 'best_day';
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

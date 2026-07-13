import { AUTO_SAVE_CAPTURE_QUALITY_FLOOR } from './scanQualityModel.js';

export const PHOTO_STACK_SESSION_GAP_MS = 30 * 60 * 1000;
export const PHOTO_STACK_NEAR_DUPLICATE_DISTANCE = 0.18;
export const PHOTO_STACK_KEEP_BASE = 1;
export const PHOTO_STACK_KEEP_EVERY = 10;
export const PHOTO_STACK_KEEP_MAX = 3;

export function buildReviewStacks(matches = [], {
  sessionGapMs = PHOTO_STACK_SESSION_GAP_MS,
  nearDuplicateDistance = PHOTO_STACK_NEAR_DUPLICATE_DISTANCE,
} = {}) {
  const stackable = [];
  const singles = [];
  const seen = new Set();

  for (const match of matches || []) {
    if (!match?.assetId || seen.has(match.assetId)) continue;
    seen.add(match.assetId);
    if (match.saved) continue;
    if ((match.mediaType || 'image') === 'video') singles.push(reviewMatchItem(match));
    else stackable.push(match);
  }

  const sessions = splitSessions(stackable, sessionGapMs);
  const items = [];
  for (const session of sessions) {
    const clusters = clusterSession(session, nearDuplicateDistance);
    for (const cluster of clusters) {
      if (cluster.length <= 1) {
        items.push(reviewMatchItem(cluster[0]));
      } else {
        items.push(reviewStackItem(cluster));
      }
    }
  }
  return [...items, ...singles].sort((a, b) => Number(b.creationTime || 0) - Number(a.creationTime || 0));
}

export function expandReviewItems(items = [], expandedStackIds = new Set()) {
  const expanded = asSet(expandedStackIds);
  const out = [];
  for (const item of items || []) {
    if (item?.type !== 'stack' || !expanded.has(item.id)) {
      out.push(item);
      continue;
    }
    out.push({ ...item, type: 'stack-control', controlForStackId: item.id });
    const keepIds = new Set(item.keep.map((match) => match.assetId));
    for (const match of item.matches) {
      out.push({
        id: `stack-match:${item.id}:${match.assetId}`,
        type: 'match',
        match,
        stackId: item.id,
        folded: !keepIds.has(match.assetId),
        creationTime: match.creationTime,
      });
    }
  }
  return out;
}

export function defaultFoldedAssetIds(items = []) {
  const ids = new Set();
  for (const item of items || []) {
    if (item?.type !== 'stack') continue;
    for (const match of item.folded) ids.add(match.assetId);
  }
  return ids;
}

export function selectedAssetIdsForReview({
  matches = [],
  reviewItems = [],
  promotedFoldedIds = new Set(),
  rejectedIds = new Set(),
} = {}) {
  const folded = defaultFoldedAssetIds(reviewItems);
  const promoted = asSet(promotedFoldedIds);
  const rejected = asSet(rejectedIds);
  const ids = new Set();

  for (const match of matches || []) {
    if (!match?.assetId || match.saved || rejected.has(match.assetId)) continue;
    if (folded.has(match.assetId) && !promoted.has(match.assetId)) continue;
    ids.add(match.assetId);
  }
  return ids;
}

export function assetIdsForReviewAction(item, action = 'accept') {
  if (!item) return [];
  if (item.type === 'match') return [item.match?.assetId].filter(Boolean);
  if (item.type === 'stack-control') return [];
  if (item.type === 'stack') {
    const list = action === 'reject' ? item.matches : item.keep;
    return list.map((match) => match.assetId).filter(Boolean);
  }
  return [];
}

export function defaultKeepCount(size) {
  const count = Number(size || 0);
  if (count <= 0) return 0;
  return Math.min(PHOTO_STACK_KEEP_MAX, PHOTO_STACK_KEEP_BASE + Math.floor(count / PHOTO_STACK_KEEP_EVERY));
}

function splitSessions(matches, sessionGapMs) {
  const sorted = [...matches].sort((a, b) => Number(b.creationTime || 0) - Number(a.creationTime || 0));
  const sessions = [];
  for (const match of sorted) {
    const current = sessions[sessions.length - 1];
    const previous = current?.[current.length - 1];
    const gap = Math.abs(Number(previous?.creationTime || 0) - Number(match.creationTime || 0));
    if (!current || gap > sessionGapMs) sessions.push([match]);
    else current.push(match);
  }
  return sessions;
}

function clusterSession(session, nearDuplicateDistance) {
  if (!sessionHasComparableFeatures(session)) return [session];

  const clusters = [];
  for (const match of session) {
    let target = null;
    for (const cluster of clusters) {
      if (cluster.some((other) => featureDistance(match, other) <= nearDuplicateDistance)) {
        target = cluster;
        break;
      }
    }
    if (target) target.push(match);
    else clusters.push([match]);
  }
  return clusters;
}

function reviewMatchItem(match) {
  return {
    id: `match:${match.assetId}`,
    type: 'match',
    match,
    creationTime: match.creationTime,
  };
}

function reviewStackItem(matches) {
  const ranked = rankStackMatches(matches);
  const keep = defaultKeepMatches(ranked);
  const keepIds = new Set(keep.map((match) => match.assetId));
  const folded = ranked.filter((match) => !keepIds.has(match.assetId));
  const pinnedCount = keep.filter(isPinnedMatch).length;
  const assetIds = ranked.map((match) => match.assetId);
  return {
    id: `stack:${assetIds.join('|')}`,
    type: 'stack',
    cover: ranked[0],
    matches: ranked,
    keep,
    folded,
    foldedCount: folded.length,
    pinnedCount,
    curationSummary: curationSummary({ keep, ranked, pinnedCount }),
    creationTime: Math.max(...ranked.map((match) => Number(match.creationTime || 0))),
  };
}

function rankStackMatches(matches) {
  return [...matches].sort((a, b) => compareRank(b, a));
}

function compareRank(a, b) {
  return compareNumber(isPinnedMatch(a) ? 1 : 0, isPinnedMatch(b) ? 1 : 0)
    || compareNumber(qualityValue(a), qualityValue(b))
    || compareNumber(a?.score, b?.score)
    || compareNumber(a?.creationTime, b?.creationTime)
    || String(a?.assetId || '').localeCompare(String(b?.assetId || ''));
}

function defaultKeepMatches(ranked) {
  const target = Math.max(defaultKeepCount(ranked.length), ranked.filter(isPinnedMatch).length);
  const keep = [];
  const keepIds = new Set();
  const add = (match) => {
    if (!match?.assetId || keepIds.has(match.assetId)) return;
    keep.push(match);
    keepIds.add(match.assetId);
  };

  for (const match of ranked) {
    if (isPinnedMatch(match)) add(match);
  }
  for (const match of ranked) {
    if (keep.length >= target) break;
    if (isPinnedMatch(match) || isBelowFloorStackMatch(match, ranked)) continue;
    add(match);
  }
  if (!keep.length && ranked[0]) add(ranked[0]);
  return keep;
}

export function isPinnedMatch(match) {
  const metadata = match?.metadata || {};
  return !!(
    match?.pinned
    || match?.curationPinned
    || match?.parentPinned
    || match?.parent_pinned
    || metadata.pinned
    || metadata.curationPinned
    || metadata.parentPinned
    || metadata.parent_pinned
  );
}

export function isBelowFloorStackMatch(match, siblings = []) {
  if (isPinnedMatch(match)) return false;
  const captureQuality = finiteOrNull(match?.captureQuality);
  if (captureQuality == null || captureQuality >= AUTO_SAVE_CAPTURE_QUALITY_FLOOR) return false;
  return (siblings || []).some((other) =>
    other?.assetId !== match?.assetId && qualityValue(other) > qualityValue(match),
  );
}

function curationSummary({ keep, ranked, pinnedCount }) {
  if (pinnedCount > 0) return `Kept parent pick · ${keep.length} of ${ranked.length}`;
  return `Kept best ${keep.length} of ${ranked.length}`;
}

export function qualityValue(match) {
  const captureQuality = finiteOrNull(match?.captureQuality);
  if (captureQuality != null) return captureQuality;
  const sharpness = finiteOrNull(match?.sharpness);
  if (sharpness != null) return Math.min(1, sharpness / 1000);
  const faceSizeRatio = finiteOrNull(match?.faceSizeRatio);
  if (faceSizeRatio != null) return faceSizeRatio;
  return 0;
}

function compareNumber(a, b) {
  const left = finiteOrNull(a);
  const right = finiteOrNull(b);
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  return left - right;
}

function sessionHasComparableFeatures(session) {
  return session.some((match) => featureVector(match)?.length);
}

export function featureDistance(a, b) {
  const left = featureVector(a);
  const right = featureVector(b);
  if (!left?.length || !right?.length || left.length !== right.length) return Infinity;
  const similarity = cosineSimilarity(left, right);
  return 1 - similarity;
}

function featureVector(match) {
  return match?.featureVector || match?.embedding || match?.featurePrint || null;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let left = 0;
  let right = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += Number(a[i] || 0) * Number(b[i] || 0);
    left += Number(a[i] || 0) ** 2;
    right += Number(b[i] || 0) ** 2;
  }
  if (!left || !right) return 0;
  return dot / (Math.sqrt(left) * Math.sqrt(right));
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asSet(value) {
  return value instanceof Set ? value : new Set(Array.isArray(value) ? value : []);
}

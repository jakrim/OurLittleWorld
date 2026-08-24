export const AUTO_SEED_CLUSTER_SIMILARITY = 0.55;
export const AUTO_SEED_MIN_BUCKET_COVERAGE = 0.6;
export const AUTO_SEED_ANALYSIS_CONCURRENCY = 3;
export const AUTO_SEED_MAX_AGE_WINDOWS = 12;
export const AUTO_SEED_MONTH_SUBWINDOWS = 4;
export const AUTO_SEED_SLICE_DIRECTION_LIMIT = 4;
export const AUTO_SEED_RECENT_DAYS = 7;
export const AUTO_SEED_MAX_CANDIDATES = 24;
export const AUTO_SEED_ANALYSIS_WAVE_SIZE = 12;
export const AUTO_SEED_MAX_DURATION_MS = 22_000;
export const AUTO_SEED_EMBED_TIMEOUT_MS = 4_000;
export const AUTO_SEED_UI_WATCHDOG_MS = 24_000;
export const AUTO_SEED_SUGGESTION_LIMIT = 3;
export const AUTO_SEED_MIN_SUGGESTION_QUALITY = 0.45;
export const AUTO_SEED_MONTH_SAMPLE_LIMIT = (
  AUTO_SEED_MONTH_SUBWINDOWS * AUTO_SEED_SLICE_DIRECTION_LIMIT * 2
);
export const AUTO_SEED_RECENCY_TIE_MARGIN = 0.025;

export const AUTO_SEED_QUALITY_WEIGHTS = Object.freeze({
  captureQuality: 0.28,
  sharpness: 0.18,
  faceSize: 0.16,
  completeness: 0.1,
  frontality: 0.1,
  exposure: 0.06,
  singleFace: 0.06,
  identity: 0.06,
});

const DAY_MS = 86400000;
const BIRTH_WINDOW_DAYS = 14;
const AUTO_SEED_MIN_NON_EMPTY_MONTH_BUCKETS = 3;
const AUTO_SEED_MAX_REFERENCES = 12;
const NEWBORN_EVIDENCE_MAX_DAYS = 13;
const DAILY_EVIDENCE_MAX_DAYS = 55;
const WEEKLY_EVIDENCE_MAX_DAYS = 183;

export function autoSeedProgressPercent({ phase, completed = 0, total = 0 } = {}) {
  const fraction = total > 0 ? Math.max(0, Math.min(1, completed / total)) : 0;
  if (phase === 'sampling') return Math.round(fraction * 15);
  if (phase === 'analyzing') return Math.round(15 + fraction * 80);
  if (phase === 'saving') return 98;
  if (phase === 'complete') return 100;
  return 0;
}

export function autoSeedProgressCopy({ phase, completed = 0, total = 0, facesFound = 0 } = {}) {
  if (phase === 'sampling') {
    return {
      title: 'Finding one clear photo',
      detail: 'Checking a small sample across time.',
    };
  }
  if (phase === 'analyzing') {
    return {
      title: facesFound > 0 ? 'Comparing clear faces' : 'Looking for a clear face',
      detail: 'This should only take a moment.',
    };
  }
  if (phase === 'saving') {
    return {
      title: 'Preparing a possible match',
      detail: 'You will confirm the photo before the review scan starts.',
    };
  }
  return {
    title: 'Starting automatic discovery',
    detail: 'Looking for photos from birthday to today.',
  };
}

export function autoSeedEvidencePolicy({ birthdayISO, now = new Date() } = {}) {
  const birth = parseLocalDate(birthdayISO);
  const today = startOfLocalDay(now);
  const ageDays = birth
    ? Math.max(0, Math.floor((today.getTime() - birth.getTime()) / DAY_MS))
    : null;

  if (ageDays != null && ageDays <= NEWBORN_EVIDENCE_MAX_DAYS) {
    return {
      key: 'newborn',
      unit: 'day',
      ageDays,
      minDistinctBuckets: 1,
      minClusterMembers: 2,
      minCoverage: 1,
    };
  }
  if (ageDays != null && ageDays <= DAILY_EVIDENCE_MAX_DAYS) {
    return {
      key: 'early-weeks',
      unit: 'day',
      ageDays,
      minDistinctBuckets: 2,
      minClusterMembers: 2,
      minCoverage: 0.5,
    };
  }
  if (ageDays != null && ageDays <= WEEKLY_EVIDENCE_MAX_DAYS) {
    return {
      key: 'young-infant',
      unit: 'week',
      ageDays,
      minDistinctBuckets: 3,
      minClusterMembers: 3,
      minCoverage: 0.55,
    };
  }
  return {
    key: 'older-baby',
    unit: 'month',
    ageDays,
    minDistinctBuckets: AUTO_SEED_MIN_NON_EMPTY_MONTH_BUCKETS,
    minClusterMembers: 3,
    minCoverage: AUTO_SEED_MIN_BUCKET_COVERAGE,
  };
}

export function buildAutoSeedWindows(birthdayISO, now = new Date()) {
  const birth = parseLocalDate(birthdayISO);
  const end = startOfNextDay(now);
  if (!birth || birth.getTime() >= end.getTime()) return [];

  const birthEnd = new Date(Math.min(end.getTime(), birth.getTime() + (BIRTH_WINDOW_DAYS + 1) * DAY_MS));
  const windows = [{
    key: 'birth-window',
    kind: 'birth',
    startMs: birth.getTime(),
    endMs: birthEnd.getTime(),
  }];

  let cursor = startOfMonth(birth);
  while (cursor.getTime() < end.getTime()) {
    const next = addMonths(cursor, 1);
    const startMs = Math.max(cursor.getTime(), birth.getTime());
    const endMs = Math.min(next.getTime(), end.getTime());
    if (endMs > startMs) {
      windows.push({
        key: monthKey(cursor),
        kind: 'month',
        startMs,
        endMs,
      });
    }
    cursor = next;
  }

  return windows;
}

export function buildAutoSeedSamplingPlan(birthdayISO, now = new Date()) {
  const windows = buildAutoSeedWindows(birthdayISO, now);
  if (!windows.length) return [];
  const birthWindow = windows.find((window) => window.kind === 'birth');
  const monthWindows = evenlySpaced(
    windows.filter((window) => window.kind === 'month'),
    AUTO_SEED_MAX_AGE_WINDOWS,
  );
  const queryGroups = [];

  if (birthWindow) {
    const birthQueries = [];
    appendWindowSlices(birthQueries, birthWindow, 2, AUTO_SEED_SLICE_DIRECTION_LIMIT);
    queryGroups.push(birthQueries);
  }
  for (const window of monthWindows) {
    const monthQueries = [];
    appendWindowSlices(monthQueries, window, AUTO_SEED_MONTH_SUBWINDOWS, AUTO_SEED_SLICE_DIRECTION_LIMIT);
    queryGroups.push(monthQueries);
  }

  const birthMs = parseLocalDate(birthdayISO)?.getTime() || 0;
  const endMs = startOfNextDay(now).getTime();
  const recentStartMs = Math.max(birthMs, endMs - AUTO_SEED_RECENT_DAYS * DAY_MS);
  for (let startMs = recentStartMs; startMs < endMs; startMs += DAY_MS) {
    const end = Math.min(endMs, startMs + DAY_MS);
    const date = new Date(startMs);
    const recentQueries = [];
    appendDirectionalQueries(recentQueries, {
      key: `recent:${date.toISOString().slice(0, 10)}`,
      bucketKey: monthKey(date),
      bucketKind: 'month',
      startMs,
      endMs: end,
    }, AUTO_SEED_SLICE_DIRECTION_LIMIT);
    queryGroups.push(recentQueries);
  }

  // Interleave age windows so the first small analysis wave represents the
  // child's life to date. The previous month-by-month plan could inspect
  // hundreds of early photos before reaching recent ones.
  const plan = interleave(queryGroups);
  const queryLimit = Math.ceil(AUTO_SEED_MAX_CANDIDATES / AUTO_SEED_SLICE_DIRECTION_LIMIT);
  const boundedPlan = plan.slice(0, queryLimit);
  const earliestAscending = queryGroups[0]?.find((query) => query.sortAscending);
  if (
    earliestAscending
    && boundedPlan.length === queryLimit
    && !boundedPlan.some((query) => query.sortAscending)
  ) {
    // The first interleaved round is newest-first in every age window. Reserve
    // one slot for the beginning of the birth window so the small sample is not
    // biased toward the end of each slice.
    boundedPlan[boundedPlan.length - 1] = earliestAscending;
  }
  return boundedPlan;
}

export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = Number(a[i] || 0);
    const bv = Number(b[i] || 0);
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function mergeAutoSeedFaceAnalysis(candidate, embedded) {
  if (!embedded?.embedding?.length || embedded.faceCount === 0) return null;
  return {
    ...candidate,
    embedding: embedded.embedding,
    faceCount: embedded.faceCount || 1,
    primaryBox: embedded.primaryBox || null,
    captureQuality: embedded.captureQuality ?? null,
    sharpness: embedded.sharpness ?? null,
    faceSizeRatio: embedded.faceSizeRatio ?? null,
    yaw: embedded.yaw ?? null,
    roll: embedded.roll ?? null,
    brightness: embedded.brightness ?? null,
  };
}

export function clusterAutoSeedFaces(
  faces,
  threshold = AUTO_SEED_CLUSTER_SIMILARITY,
) {
  const clusters = [];
  for (const face of faces || []) {
    if (!face?.embedding?.length) continue;
    const cluster = clusters.find((item) => (
      item.members.reduce(
        (sum, member) => sum + cosineSimilarity(member.embedding, face.embedding),
        0,
      ) / item.members.length >= threshold
    ));
    if (cluster) cluster.members.push(face);
    else clusters.push({ id: clusters.length + 1, members: [face] });
  }
  return clusters.map((cluster) => ({
    ...cluster,
    monthBucketKeys: unique(
      cluster.members
        .filter((member) => member.bucketKind === 'month')
        .map((member) => member.bucketKey),
    ),
  }));
}

export function selectAutoSeedCluster({
  faces,
  threshold = AUTO_SEED_CLUSTER_SIMILARITY,
  minCoverage,
  birthdayISO,
  now = new Date(),
  evidencePolicy,
} = {}) {
  const policy = evidencePolicy || autoSeedEvidencePolicy({ birthdayISO, now });
  const requiredCoverage = minCoverage ?? policy.minCoverage;
  const preparedFaces = (faces || [])
    .filter((face) => face?.embedding?.length)
    .map((face) => ({
      ...face,
      evidenceBucketKey: autoSeedEvidenceBucketKey(face, policy, birthdayISO),
    }));
  const nonEmptyEvidenceBucketKeys = unique(
    preparedFaces.map((face) => face.evidenceBucketKey),
  );
  const clusters = clusterAutoSeedFaces(preparedFaces, threshold)
    .map((cluster) => ({
      ...cluster,
      evidenceBucketKeys: unique(cluster.members.map((member) => member.evidenceBucketKey)),
    }))
    .sort((a, b) => (
      b.evidenceBucketKeys.length - a.evidenceBucketKeys.length
      || b.members.length - a.members.length
    ));
  if (nonEmptyEvidenceBucketKeys.length < policy.minDistinctBuckets) {
    return {
      status: 'fallback',
      reason: 'not-enough-time-coverage',
      nonEmptyBucketCount: nonEmptyEvidenceBucketKeys.length,
      evidencePolicy: policy,
      clusters,
    };
  }

  const winner = clusters[0] || null;
  const coverage = winner
    ? winner.evidenceBucketKeys.length / nonEmptyEvidenceBucketKeys.length
    : 0;
  if (
    !winner
    || winner.members.length < policy.minClusterMembers
    || winner.evidenceBucketKeys.length < policy.minDistinctBuckets
    || coverage < requiredCoverage
  ) {
    return {
      status: 'fallback',
      reason: 'low-cluster-coverage',
      nonEmptyBucketCount: nonEmptyEvidenceBucketKeys.length,
      coverage,
      evidencePolicy: policy,
      clusters,
    };
  }

  return {
    status: 'matched',
    cluster: winner,
    coverage,
    nonEmptyBucketCount: nonEmptyEvidenceBucketKeys.length,
    evidencePolicy: policy,
    clusters,
  };
}

export function selectAutoSeedSuggestions({
  faces,
  clusters,
  limit = AUTO_SEED_SUGGESTION_LIMIT,
  minQuality = AUTO_SEED_MIN_SUGGESTION_QUALITY,
} = {}) {
  const sourceClusters = Array.isArray(clusters) && clusters.length
    ? clusters
    : clusterAutoSeedFaces(faces || []);
  return sourceClusters
    .map((cluster) => selectAutoSeedRepresentative(cluster.members))
    .filter((candidate) => (
      candidate
      && Number(candidate.faceCount || 1) === 1
      && Number(candidate.qualityScore || 0) >= minQuality
    ))
    .sort(compareAutoSeedCandidates)
    .filter((candidate, index, items) => (
      items.findIndex((item) => item.assetId === candidate.assetId) === index
    ))
    .slice(0, Math.max(0, Math.min(AUTO_SEED_SUGGESTION_LIMIT, limit)));
}

export function identityCentrality(candidate, members) {
  const peers = (members || []).filter((member) => member !== candidate && member?.embedding?.length);
  if (!candidate?.embedding?.length) return 0;
  if (!peers.length) return 1;
  return peers.reduce(
    (sum, member) => sum + cosineSimilarity(candidate.embedding, member.embedding),
    0,
  ) / peers.length;
}

export function autoSeedQualityScore(candidate, members = []) {
  if (!candidate?.embedding?.length || !(candidate.localUri || candidate.uri)) return 0;
  const identity = finite(candidate.identityConfidence) ?? identityCentrality(candidate, members);
  const signals = {
    captureQuality: clamp01(finite(candidate.captureQuality)),
    sharpness: clamp01(finite(candidate.sharpness)),
    faceSize: faceSizeScore(candidate.faceSizeRatio),
    completeness: faceCompletenessScore(candidate.primaryBox),
    frontality: frontalityScore(candidate.yaw, candidate.roll),
    exposure: exposureScore(candidate.brightness),
    singleFace: faceCountScore(candidate.faceCount),
    identity: identityScore(identity),
  };
  let weighted = 0;
  let availableWeight = 0;
  for (const [key, weight] of Object.entries(AUTO_SEED_QUALITY_WEIGHTS)) {
    const value = signals[key];
    if (value == null) continue;
    weighted += value * weight;
    availableWeight += weight;
  }
  return availableWeight > 0 ? weighted / availableWeight : 0;
}

export function scoreAutoSeedCandidates(members) {
  return (members || [])
    .filter((member) => member?.embedding?.length && (member.localUri || member.uri))
    .map((member) => {
      const identityConfidence = identityCentrality(member, members);
      const candidate = { ...member, identityConfidence };
      return {
        ...candidate,
        qualityScore: autoSeedQualityScore(candidate, members),
      };
    });
}

export function compareAutoSeedCandidates(a, b) {
  const qualityDiff = Number(b?.qualityScore || 0) - Number(a?.qualityScore || 0);
  if (Math.abs(qualityDiff) > AUTO_SEED_RECENCY_TIE_MARGIN) return qualityDiff;

  const bothMeasured = hasMeasuredVisualQuality(a) && hasMeasuredVisualQuality(b);
  if (bothMeasured) {
    const recencyDiff = Number(b?.creationTime || 0) - Number(a?.creationTime || 0);
    if (recencyDiff) return recencyDiff;
  }

  const identityDiff = Number(b?.identityConfidence || 0) - Number(a?.identityConfidence || 0);
  if (identityDiff) return identityDiff;
  const faceCountDiff = Math.abs(Number(a?.faceCount || 1) - 1) - Math.abs(Number(b?.faceCount || 1) - 1);
  if (faceCountDiff) return faceCountDiff;
  return String(a?.assetId || '').localeCompare(String(b?.assetId || ''));
}

export function selectAutoSeedRepresentative(members) {
  return scoreAutoSeedCandidates(members).sort(compareAutoSeedCandidates)[0] || null;
}

export function selectAutoSeedFirstLookCandidate(members, representativeAssetId) {
  return scoreAutoSeedCandidates(members)
    .filter((candidate) => candidate.assetId !== representativeAssetId)
    .sort(compareAutoSeedCandidates)[0] || null;
}

export function selectAutoSeedReferences(members, maxReferences = AUTO_SEED_MAX_REFERENCES) {
  const scored = scoreAutoSeedCandidates(members);
  const representative = [...scored].sort(compareAutoSeedCandidates)[0] || null;
  const byBucket = new Map();
  for (const member of scored) {
    const key = member.evidenceBucketKey || member.bucketKey || `asset:${member.assetId}`;
    const previous = byBucket.get(key);
    if (!previous || compareAutoSeedCandidates(member, previous) < 0) byBucket.set(key, member);
  }
  const spread = Array.from(byBucket.values())
    .sort((a, b) => Number(a.creationTime || 0) - Number(b.creationTime || 0));
  if (spread.length <= maxReferences) return spread;

  const selected = evenlySpaced(spread, maxReferences);
  if (representative && !selected.some((item) => item.assetId === representative.assetId)) {
    const replaceIndex = closestNonEndpointIndex(selected, representative);
    selected[replaceIndex] = representative;
  }
  return uniqueByAsset(selected)
    .sort((a, b) => Number(a.creationTime || 0) - Number(b.creationTime || 0));
}

function autoSeedEvidenceBucketKey(candidate, policy, birthdayISO) {
  const captured = new Date(Number(candidate?.creationTime));
  if (Number.isNaN(captured.getTime())) {
    return candidate?.bucketKey || `asset:${candidate?.assetId || 'unknown'}`;
  }
  if (policy.unit === 'day') return localDayKey(captured);
  if (policy.unit === 'week') {
    const birth = parseLocalDate(birthdayISO);
    if (!birth) return `week:${localDayKey(captured)}`;
    const dayOffset = Math.max(
      0,
      Math.floor((startOfLocalDay(captured).getTime() - birth.getTime()) / DAY_MS),
    );
    return `week:${Math.floor(dayOffset / 7)}`;
  }
  return candidate?.bucketKey || monthKey(captured);
}

export function selectAutoSeedPreview(members) {
  return selectAutoSeedRepresentative(members);
}

function appendWindowSlices(plan, window, count, limit) {
  const duration = Math.max(1, window.endMs - window.startMs);
  for (let index = 0; index < count; index += 1) {
    const startMs = Math.round(window.startMs + duration * (index / count));
    const endMs = Math.round(window.startMs + duration * ((index + 1) / count));
    appendDirectionalQueries(plan, {
      key: `${window.key}:${index}`,
      bucketKey: window.key,
      bucketKind: window.kind,
      startMs,
      endMs,
    }, limit);
  }
}

function appendDirectionalQueries(plan, slice, limit) {
  plan.push({ ...slice, pageSize: limit, sortAscending: false });
  plan.push({ ...slice, pageSize: limit, sortAscending: true });
}

function interleave(groups) {
  const output = [];
  const maxLength = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      if (group[index]) output.push(group[index]);
    }
  }
  return output;
}

function faceSizeScore(value) {
  const area = finite(value);
  if (area == null) return null;
  if (area <= 0.01) return clamp01((area / 0.01) * 0.15);
  if (area < 0.08) return 0.15 + ((area - 0.01) / 0.07) * 0.85;
  if (area <= 0.45) return 1;
  if (area < 0.75) return 1 - ((area - 0.45) / 0.3) * 0.5;
  return 0.5;
}

function faceCompletenessScore(box) {
  if (!box) return null;
  const x = finite(box.x);
  const y = finite(box.y);
  const w = finite(box.w);
  const h = finite(box.h);
  if ([x, y, w, h].some((value) => value == null)) return null;
  const margin = Math.min(x, y, 1 - x - w, 1 - y - h);
  return clamp01(margin / 0.03);
}

function frontalityScore(yawValue, rollValue) {
  const yaw = finite(yawValue);
  const roll = finite(rollValue);
  if (yaw == null && roll == null) return null;
  const normalizedYaw = yaw == null ? 0 : Math.abs(yaw) / 0.7;
  const normalizedRoll = roll == null ? 0 : Math.abs(roll) / 0.7;
  return 1 - clamp01(Math.max(normalizedYaw, normalizedRoll));
}

function exposureScore(value) {
  const brightness = finite(value);
  if (brightness == null) return null;
  if (brightness < 0.2) return clamp01(brightness / 0.2) * 0.5;
  if (brightness < 0.35) return 0.5 + ((brightness - 0.2) / 0.15) * 0.5;
  if (brightness <= 0.78) return 1;
  if (brightness < 0.95) return 1 - ((brightness - 0.78) / 0.17) * 0.5;
  return 0.5;
}

function faceCountScore(value) {
  const count = finite(value);
  if (count == null) return null;
  if (count <= 1) return 1;
  if (count === 2) return 0.72;
  return 0.45;
}

function identityScore(value) {
  const similarity = finite(value);
  if (similarity == null) return null;
  return clamp01((similarity - AUTO_SEED_CLUSTER_SIMILARITY) / 0.35);
}

function hasMeasuredVisualQuality(candidate) {
  return [
    candidate?.captureQuality,
    candidate?.sharpness,
    candidate?.faceSizeRatio,
    candidate?.primaryBox,
    candidate?.yaw,
    candidate?.roll,
    candidate?.brightness,
  ].filter((value) => value != null).length >= 2;
}

function closestNonEndpointIndex(selected, representative) {
  if (selected.length <= 2) return selected.length - 1;
  let bestIndex = 1;
  let bestDistance = Infinity;
  for (let index = 1; index < selected.length - 1; index += 1) {
    const distance = Math.abs(
      Number(selected[index]?.creationTime || 0) - Number(representative?.creationTime || 0),
    );
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
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

function uniqueByAsset(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.assetId || seen.has(item.assetId)) return false;
    seen.add(item.assetId);
    return true;
  });
}

function parseLocalDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function startOfNextDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDayKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp01(value) {
  if (value == null) return null;
  return Math.max(0, Math.min(1, value));
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

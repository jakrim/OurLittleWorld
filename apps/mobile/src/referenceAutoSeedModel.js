export const AUTO_SEED_MONTH_SAMPLE_LIMIT = 30;
export const AUTO_SEED_CLUSTER_SIMILARITY = 0.55;
export const AUTO_SEED_MIN_BUCKET_COVERAGE = 0.6;

const DAY_MS = 86400000;
const BIRTH_WINDOW_DAYS = 14;
const AUTO_SEED_MIN_NON_EMPTY_MONTH_BUCKETS = 3;
const AUTO_SEED_MAX_REFERENCES = 12;

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

export function clusterAutoSeedFaces(
  faces,
  threshold = AUTO_SEED_CLUSTER_SIMILARITY,
) {
  const clusters = [];
  for (const face of faces || []) {
    if (!face?.embedding?.length) continue;
    const cluster = clusters.find((item) => (
      item.members.some((member) => cosineSimilarity(member.embedding, face.embedding) >= threshold)
    ));
    if (cluster) {
      cluster.members.push(face);
    } else {
      clusters.push({ id: clusters.length + 1, members: [face] });
    }
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
  minCoverage = AUTO_SEED_MIN_BUCKET_COVERAGE,
} = {}) {
  const nonEmptyMonthBucketKeys = unique(
    (faces || [])
      .filter((face) => face?.bucketKind === 'month' && face?.embedding?.length)
      .map((face) => face.bucketKey),
  );
  if (nonEmptyMonthBucketKeys.length < AUTO_SEED_MIN_NON_EMPTY_MONTH_BUCKETS) {
    return { status: 'fallback', reason: 'not-enough-month-buckets', nonEmptyMonthBucketCount: nonEmptyMonthBucketKeys.length };
  }

  const clusters = clusterAutoSeedFaces(faces, threshold)
    .sort((a, b) => b.monthBucketKeys.length - a.monthBucketKeys.length || b.members.length - a.members.length);
  const winner = clusters[0] || null;
  const coverage = winner
    ? winner.monthBucketKeys.length / nonEmptyMonthBucketKeys.length
    : 0;
  if (!winner || coverage < minCoverage) {
    return {
      status: 'fallback',
      reason: 'low-cluster-coverage',
      nonEmptyMonthBucketCount: nonEmptyMonthBucketKeys.length,
      coverage,
      clusters,
    };
  }

  return {
    status: 'matched',
    cluster: winner,
    coverage,
    nonEmptyMonthBucketCount: nonEmptyMonthBucketKeys.length,
    clusters,
  };
}

export function selectAutoSeedReferences(members, maxReferences = AUTO_SEED_MAX_REFERENCES) {
  const byBucket = new Map();
  for (const member of members || []) {
    const key = member.bucketKey || `asset:${member.assetId}`;
    const previous = byBucket.get(key);
    if (!previous || Number(member.creationTime || 0) > Number(previous.creationTime || 0)) {
      byBucket.set(key, member);
    }
  }
  const spread = Array.from(byBucket.values())
    .sort((a, b) => Number(a.creationTime || 0) - Number(b.creationTime || 0));
  if (spread.length <= maxReferences) return spread;
  if (maxReferences <= 1) return [selectAutoSeedPreview(spread)];

  const selected = [];
  const seen = new Set();
  for (let i = 0; i < maxReferences; i += 1) {
    const index = Math.round((i * (spread.length - 1)) / (maxReferences - 1));
    const item = spread[index];
    if (!item || seen.has(item.assetId)) continue;
    selected.push(item);
    seen.add(item.assetId);
  }
  return selected;
}

export function selectAutoSeedPreview(members) {
  const list = (members || []).filter((member) => member?.embedding?.length);
  if (!list.length) return null;
  let best = list[0];
  let bestScore = -Infinity;
  for (const candidate of list) {
    const others = list.filter((member) => member !== candidate);
    const average = others.length
      ? others.reduce((sum, member) => sum + cosineSimilarity(candidate.embedding, member.embedding), 0) / others.length
      : 1;
    const recencyTieBreak = Number(candidate.creationTime || 0) / 100000000000000;
    const score = average + recencyTieBreak;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
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

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

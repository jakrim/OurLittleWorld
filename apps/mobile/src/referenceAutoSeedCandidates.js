import { AUTO_SEED_MAX_CANDIDATES } from './referenceAutoSeedModel.js';

export async function collectAutoSeedCandidates({
  plan = [],
  fetchPhotosPageFn,
  onProgress,
  signal,
  maxCandidates = AUTO_SEED_MAX_CANDIDATES,
} = {}) {
  const seen = new Set();
  const candidates = [];
  let completedQueries = 0;

  emitProgress(onProgress, {
    phase: 'sampling',
    completed: 0,
    total: plan.length,
    sampledCount: 0,
  });

  for (const query of plan) {
    if (signal?.aborted || candidates.length >= maxCandidates) break;
    const page = await fetchPhotosPageFn({
      pageSize: query.pageSize,
      createdAfterMs: query.startMs,
      createdBeforeMs: query.endMs,
      sortAscending: query.sortAscending,
    });
    for (const asset of page.assets || []) {
      if (candidates.length >= maxCandidates) break;
      const assetId = asset.assetId || asset.id;
      if (!assetId || seen.has(assetId)) continue;
      seen.add(assetId);
      candidates.push({
        ...asset,
        assetId,
        bucketKey: query.bucketKey,
        bucketKind: query.bucketKind,
      });
    }
    completedQueries += 1;
    emitProgress(onProgress, {
      phase: 'sampling',
      completed: completedQueries,
      total: plan.length,
      sampledCount: candidates.length,
    });
  }

  return {
    candidates,
    queryCount: completedQueries,
    boundedAt: maxCandidates,
  };
}

function emitProgress(onProgress, progress) {
  try {
    onProgress?.(progress);
  } catch {
    // Progress reporting must never interrupt local discovery.
  }
}

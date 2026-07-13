import { embedFace } from './faceMatcher';
import { fetchPhotosPage, getAssetDetails } from './photos';
import { saveAutoSeedReferences } from './recognitionReferences';
import { collectAutoSeedCandidates } from './referenceAutoSeedCandidates';
import {
  AUTO_SEED_ANALYSIS_CONCURRENCY,
  AUTO_SEED_MAX_CANDIDATES,
  buildAutoSeedSamplingPlan,
  mergeAutoSeedFaceAnalysis,
  selectAutoSeedCluster,
  selectAutoSeedRepresentative,
  selectAutoSeedReferences,
} from './referenceAutoSeedModel';

export async function bootstrapBirthdayReference({
  familyId,
  userId,
  birthdayISO,
  now = new Date(),
  embedFaceFn = embedFace,
  fetchPhotosPageFn = fetchPhotosPage,
  getAssetDetailsFn = getAssetDetails,
  saveAutoSeedReferencesFn = saveAutoSeedReferences,
  onProgress,
  signal,
} = {}) {
  const startedAt = Date.now();
  if (!familyId || !userId || !birthdayISO) {
    return { status: 'fallback', reason: 'missing-context' };
  }

  const samplingPlan = buildAutoSeedSamplingPlan(birthdayISO, now);
  const sampledResult = await collectAutoSeedCandidates({
    plan: samplingPlan,
    fetchPhotosPageFn,
    onProgress,
    signal,
  });
  const sampled = sampledResult.candidates;
  if (signal?.aborted) return { status: 'fallback', reason: 'cancelled' };
  if (!sampled.length) {
    return {
      status: 'fallback',
      reason: 'no-photos',
      diagnostics: buildDiagnostics({
        startedAt,
        sampledResult,
        analyzed: 0,
        facesFound: 0,
      }),
    };
  }

  let analyzed = 0;
  let facesFound = 0;
  emitProgress(onProgress, {
    phase: 'analyzing',
    completed: 0,
    total: sampled.length,
    facesFound: 0,
  });
  const analyzedFaces = await mapWithConcurrency(
    sampled,
    AUTO_SEED_ANALYSIS_CONCURRENCY,
    async (candidate) => {
      if (signal?.aborted) return null;
      let embedded = null;
      try {
        embedded = await embedFaceFn(candidate.localUri || candidate.uri);
      } catch {
        embedded = null;
      }
      const face = mergeAutoSeedFaceAnalysis(candidate, embedded);
      analyzed += 1;
      if (face) facesFound += 1;
      emitProgress(onProgress, {
        phase: 'analyzing',
        completed: analyzed,
        total: sampled.length,
        facesFound,
      });
      return face;
    },
    signal,
  );
  if (signal?.aborted) return { status: 'fallback', reason: 'cancelled' };
  const faces = analyzedFaces.filter(Boolean);

  const selection = selectAutoSeedCluster({ faces });
  if (selection.status !== 'matched') {
    return {
      ...selection,
      diagnostics: buildDiagnostics({
        startedAt,
        sampledResult,
        analyzed,
        facesFound,
      }),
    };
  }

  const representative = selectAutoSeedRepresentative(selection.cluster.members);
  const seeds = selectAutoSeedReferences(selection.cluster.members);
  if (!seeds.length) {
    return { status: 'fallback', reason: 'no-seed-references' };
  }

  emitProgress(onProgress, {
    phase: 'saving',
    completed: 0,
    total: seeds.length,
    facesFound,
  });
  if (signal?.aborted) return { status: 'fallback', reason: 'cancelled' };
  const profile = await saveAutoSeedReferencesFn({
    familyId,
    userId,
    birthdayISO,
    references: seeds,
    representativeAssetId: representative?.assetId,
  });

  if (signal?.aborted) return { status: 'fallback', reason: 'cancelled' };
  const storedRepresentative = profile?.references?.find(
    (reference) => reference.id === profile.representativeReferenceId,
  );
  const rawPreview = representative || storedRepresentative || seeds[0];
  const previewDetails = rawPreview?.assetId
    ? await getAssetDetailsFn(rawPreview.assetId, { downloadFromNetwork: true }).catch(() => null)
    : null;
  const preview = {
    ...rawPreview,
    ...(previewDetails || {}),
    assetId: rawPreview?.assetId || previewDetails?.id || null,
    embedding: rawPreview?.embedding || null,
    faceCount: rawPreview?.faceCount || 1,
  };
  emitProgress(onProgress, {
    phase: 'complete',
    completed: seeds.length,
    total: seeds.length,
    facesFound,
  });

  return {
    status: 'seeded',
    referenceCount: seeds.length,
    preview,
    coverage: selection.coverage,
    nonEmptyMonthBucketCount: selection.nonEmptyMonthBucketCount,
    diagnostics: {
      ...buildDiagnostics({ startedAt, sampledResult, analyzed, facesFound }),
      referenceAgeBucketCount: new Set(seeds.map((seed) => seed.bucketKey).filter(Boolean)).size,
      representativeQualityBand: qualityBand(representative?.qualityScore),
    },
  };
}

function buildDiagnostics({ startedAt, sampledResult, analyzed, facesFound }) {
  return {
    candidateCount: sampledResult?.candidates?.length || 0,
    candidateLimit: AUTO_SEED_MAX_CANDIDATES,
    facesAnalyzed: analyzed,
    facesFound,
    analysisConcurrency: AUTO_SEED_ANALYSIS_CONCURRENCY,
    queryCount: sampledResult?.queryCount || 0,
    cacheHits: 0,
    incrementalReuse: false,
    durationMs: Math.max(0, Date.now() - startedAt),
  };
}

function qualityBand(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 'unknown';
  if (score >= 0.8) return 'strong';
  if (score >= 0.6) return 'usable';
  return 'limited';
}

async function mapWithConcurrency(items, concurrency, worker, signal) {
  const results = new Array(items.length).fill(null);
  let nextIndex = 0;

  async function runWorker() {
    while (!signal?.aborted) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

function emitProgress(onProgress, progress) {
  try {
    onProgress?.(progress);
  } catch {
    // Progress reporting must never interrupt local discovery.
  }
}

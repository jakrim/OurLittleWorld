/**
 * Wrapper around our native Vision-based face matcher (modules/expo-face-matcher).
 *
 * Falls back to a graceful "no native module" mode so the JS can ship and run
 * even before the next dev build lands. In that mode `findMatches` returns
 * the candidates in chronological order with a constant similarity, letting
 * the user manually confirm.
 *
 * Public API
 * ----------
 *   embedFace(localUri) → { embedding, faceCount, primaryBox, captureQuality, faceSizeRatio, sharpness, yaw, roll, brightness } | null
 *   matchAgainst({ reference, candidates }) → [{ assetId, score, faceCount, captureQuality, faceSizeRatio, sharpness, yaw, roll, brightness, featureVector, visualFingerprint }]
 *
 * Embeddings are L2-normalised so cosine similarity == dot product.
 */

import { countPhotosInWindow, fetchPhotosPage } from './photos';
import {
  DEFAULT_NATIVE_MATCH_BATCH_TIMEOUT_MS,
  mergeMultiReferenceMatches,
  nativeReferenceInputs,
  resolveNativeMatchBatchTimeout,
  selectMatchReferences,
} from './faceMatcherModel';

let native = null;
try {
  // Local Expo Module — auto-linked from /modules/expo-face-matcher.
  // Defensive try/catch lets the JS still bundle on devices that don't
  // yet have the native binary baked in (older dev builds).
  const ExpoFaceMatcher = require('../modules/expo-face-matcher').default;
  native = ExpoFaceMatcher;
} catch {
  native = null;
}

export const isNative = !!native;

/**
 * Compute a face embedding for a local image URI. Returns null if no face
 * was detected, or the native module isn't available.
 */
export async function embedFace(localUri) {
  if (!native || !localUri) return null;
  try {
    return await native.embedFace(localUri);
  } catch (e) {
    console.warn('embedFace failed', e?.message);
    return null;
  }
}

/**
 * Score a list of candidate asset URIs against the reference embedding.
 * Returns array sorted by similarity descending (best match first).
 *
 *   reference: { embedding: number[] }
 *   candidates: [{ assetId, localUri }]
 *
 * Native module returns scores in [0..1] (higher = more similar) plus the
 * selected face crop's feature vector for on-device lookalike suppression.
 * If native is unavailable, we return uniform 0.5 score so the user
 * can still walk through their library manually.
 */
export async function matchAgainst({
  reference,
  candidates,
  timeoutMs = DEFAULT_NATIVE_MATCH_BATCH_TIMEOUT_MS,
}) {
  if (!candidates?.length) return [];

  if (!native || !reference?.embedding) {
    return candidates.map((c) => ({
      assetId: c.assetId,
      score: 0.5,
      faceCount: 0,
      captureQuality: null,
      faceSizeRatio: null,
      sharpness: null,
      yaw: null,
      roll: null,
      brightness: null,
      featureVector: null,
      visualFingerprint: null,
    }));
  }

  try {
    const out = await withTimeout(
      native.matchAgainst(
        { embedding: reference.embedding },
        candidates.map((c) => ({ assetId: c.assetId, localUri: c.localUri })),
      ),
      resolveNativeMatchBatchTimeout(timeoutMs),
      'Native photo analysis took too long',
    );
    return out.sort((a, b) => b.score - a.score);
  } catch (e) {
    console.warn('matchAgainst failed', e?.message);
    return candidates.map((c) => emptyNativeMatch(c.assetId));
  }
}

export async function matchAgainstReferenceProfile({
  profile,
  birthdayISO,
  fallbackReference,
  candidates,
  referenceLimit,
  batchId,
  timeoutMs = DEFAULT_NATIVE_MATCH_BATCH_TIMEOUT_MS,
}) {
  if (!candidates?.length) return [];
  const references = selectMatchReferences({
    profile,
    birthdayISO,
    candidates,
    fallbackReference,
    referenceLimit,
  });
  if (!references.length) return matchAgainst({ reference: null, candidates });

  const resolvedTimeoutMs = resolveNativeMatchBatchTimeout(timeoutMs);
  let results = [];
  let batchSummary = {
    timedOut: false,
    cancelled: false,
    processedAssetIds: candidates.map((candidate) => candidate.assetId),
    durationMs: null,
  };
  if (native?.matchAgainstMany) {
    try {
      const batch = await withTimeout(
        native.matchAgainstMany(
          nativeReferenceInputs(references),
          candidates.map((candidate) => ({
            assetId: candidate.assetId,
            localUri: candidate.localUri,
          })),
          {
            batchId: String(batchId || `match-${Date.now()}`),
            timeoutMs: resolvedTimeoutMs,
          },
        ),
        resolvedTimeoutMs + 1_500,
        'Native photo batch did not return',
      );
      results = Array.isArray(batch?.results) ? batch.results : [];
      batchSummary = {
        timedOut: batch?.timedOut === true,
        cancelled: batch?.cancelled === true,
        processedAssetIds: Array.isArray(batch?.processedAssetIds)
          ? batch.processedAssetIds
          : [],
        durationMs: Number.isFinite(Number(batch?.durationMs))
          ? Number(batch.durationMs)
          : null,
      };
    } catch (error) {
      cancelNativeMatchBatch(batchId);
      console.warn('matchAgainstMany failed', error?.message);
      results = [];
      batchSummary = {
        ...batchSummary,
        timedOut: true,
        processedAssetIds: [],
      };
    }
  } else {
    // Older development clients do not have the one-pass native API. Keep the
    // complete legacy attempt within the same wall-clock budget and fail
    // closed rather than letting one reference hold onboarding indefinitely.
    const perReferenceTimeout = Math.max(
      1_000,
      Math.floor(resolvedTimeoutMs / Math.max(1, references.length)),
    );
    for (const reference of references) {
      const scored = await matchAgainst({
        reference,
        candidates,
        timeoutMs: perReferenceTimeout,
      });
      results.push(...scored.map((result) => ({
        ...result,
        referenceId: reference.id,
      })));
    }
  }

  const merged = mergeMultiReferenceMatches({
    profile,
    birthdayISO,
    candidates,
    references,
    results,
  });
  Object.defineProperty(merged, 'batchSummary', {
    value: batchSummary,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return merged;
}

export function cancelNativeMatchBatch(batchId) {
  if (!batchId || !native?.cancelMatchBatch) return false;
  try {
    return native.cancelMatchBatch(String(batchId)) === true;
  } catch {
    return false;
  }
}

/**
 * Walk the user's photo library, in chronological windows, computing
 * face matches against the reference. Emits progress callbacks so the
 * UI can show a smooth bar.
 *
 *   await scanLibrary({
 *     reference,
 *     since: babyBirthdayMs,
 *     batchSize: 100,
 *     onProgress: (done, total) => ...,
 *     onBatch:   (matches[]) => ...,   // partial top-N as we go
 *     threshold: 0.62,                 // dot-product cosine cutoff
 *   })
 *
 * Pagination overlaps native scoring (fetch N+1 while batch N scores); same
 * asset set and thresholds as sequential paging.
 */
export async function countCandidates({ since } = {}) {
  return countPhotosInWindow({ createdAfterMs: since });
}

export async function scanLibrary({
  reference,
  since,
  threshold = 0.62,
  batchSize = 60,
  onProgress,
  onBatch,
  signal,
} = {}) {
  let totalSeen = 0;
  let total;
  const all = [];

  let page = await fetchPhotosPage({
    pageSize: batchSize,
    createdAfterMs: since,
  });

  while (true) {
    if (signal?.aborted) break;

    if (page.assets.length === 0) break;

    const nextPagePromise =
      page.hasNextPage && !signal?.aborted
        ? fetchPhotosPage({
          after: page.endCursor,
          pageSize: batchSize,
          createdAfterMs: since,
        })
        : null;

    const candidates = page.assets.map((a) => ({
      assetId: a.id,
      localUri: a.localUri || a.uri,
      creationTime: a.creationTime,
    }));

    let scored = await matchAgainst({ reference, candidates });
    if (threshold != null) scored = scored.filter((s) => s.score >= threshold);

    // Re-attach creationTime for ordering downstream
    const byId = new Map(candidates.map((c) => [c.assetId, c]));
    const enriched = scored.map((s) => ({ ...s, creationTime: byId.get(s.assetId)?.creationTime }));

    all.push(...enriched);
    totalSeen += page.assets.length;
    onProgress?.(totalSeen, total);
    if (enriched.length) onBatch?.(enriched);

    if (!page.hasNextPage) break;
    if (!nextPagePromise) break;
    page = await nextPagePromise;
  }

  // Default sort by score DESC so the review screen shows best matches first.
  return all.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function emptyNativeMatch(assetId) {
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

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

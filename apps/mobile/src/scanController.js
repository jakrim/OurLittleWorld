/**
 * Background scan controller.
 *
 * The face scan can take 5–15 minutes on libraries with thousands of baby
 * photos. We don't want the user staring at a radar screen — we want them
 * scrolling through results as they appear, navigating to the timeline,
 * coming back, etc. This module owns the scan as a singleton: matches
 * stream into module-level state, React screens subscribe via
 * `useScanState()`, and the scan keeps running until the JS engine dies.
 *
 * Page fetch overlaps native scoring: while `matchAgainst` runs on batch N,
 * `fetchPhotosPage` for batch N+1 is already in flight (same
 * params as before — accuracy unchanged).
 *
 * State shape:
 *   {
 *     phase:    'idle' | 'scanning' | 'done' | 'failed' | 'aborted',
 *     seen:     number,            // media assets read by MediaLibrary so far
 *     total:    number | null,     // total media in birthday→now window
 *     matches:  Array<Match>,      // appended as batches finish (newest first)
 *     errors:   number,
 *     error:    string | null,
 *     startedAt: number | null,
 *   }
 *
 * Match shape:
 *   { assetId, mediaType, score, faceCount, captureQuality, faceSizeRatio, sharpness, featureVector, creationTime, uri, accepted, saved }
 */

import { useEffect, useState } from 'react';
import {
  countPhotosInWindow,
  countVideosInWindow,
  fetchMediaScanCandidatesByIds,
  fetchPhotosPage,
  fetchVideoFrameCandidatesPage,
} from './photos';
import { matchAgainstReferenceProfile, isNative } from './faceMatcher';
import { buildDailyCurationPlan } from './dailyCurationModel';
import { collapseScoredMediaCandidates } from './scanMediaMatchModel';
import { HIGH_CONFIDENCE_THRESHOLD } from './recognitionTrust';
import { CANDIDATE_LIVE_MATCH_LIMIT } from './candidateLedgerModel';
import {
  DEFAULT_SCAN_PHOTO_PAGE_SIZE,
  resolveScanPhotoPageSize,
} from './scanPacingModel';

const initialState = () => ({
  phase: 'idle',
  seen: 0,
  total: null,
  matches: [],
  // Incrementally maintained counters so screens never need to iterate
  // the full matches array just to draw a header. With 2000+ items,
  // re-counting per render was the actual bottleneck.
  acceptedCount: 0,
  savedCount: 0,           // saved (auto + manual)
  autoSavedCount: 0,       // saved by the background auto-saver
  autoSaveQueueLength: 0,  // pending in the auto-save queue
  autoSaveErrors: 0,
  highCount: 0,        // score >= 0.75
  borderlineCount: 0,  // score < 0.75
  errors: 0,
  error: null,
  startedAt: null,
  finishedAt: null,
  scanKey: null,
  totalMatchCount: 0,
});

const HIGH_THRESHOLD = HIGH_CONFIDENCE_THRESHOLD;
const AUTO_SAVE_THRESHOLD_DEFAULT = 0.9;
const AUTO_SAVE_CONCURRENCY = 3;
const VIDEO_PAGE_SIZE = 8;

function fetchPhotoPage(after, since, pageSize = DEFAULT_SCAN_PHOTO_PAGE_SIZE) {
  return fetchPhotosPage({
    after,
    pageSize,
    createdAfterMs: since,
  });
}

let state = initialState();
const listeners = new Set();
let abortFlag = null;

// Auto-save queue. Lives across the lifetime of a single scan (cleared in
// reset()). Workers pull asset IDs off and call the saveFn provided to
// `start()` — typically Tags.setBaby. We keep concurrency low here so we
// don't compete with the user if they're actively saving from review.
let autoSaveQueue = [];
let autoSaveSeen = new Set();
let autoSaveFn = null;
let autoSaveActiveWorkers = 0;
let autoSavePlanMatches = [];
const AUTO_SAVE_GLOBAL_CONCURRENCY = AUTO_SAVE_CONCURRENCY;

// Throttled broadcaster. The native scan can land 60-photo batches in
// quick succession; if every batch triggered React subscribers that
// iterate the (growing) matches array, the JS thread becomes the
// bottleneck and slows the next native call. We coalesce updates into
// 250ms windows so the UI feels live but never starves the scanner.
let pendingFlush = null;
const FLUSH_MS = 250;
let dirty = false;

function flush() {
  pendingFlush = null;
  if (!dirty) return;
  dirty = false;
  state = { ...state }; // new identity for change detection
  for (const fn of listeners) fn(state);
}

function notify({ immediate = false } = {}) {
  dirty = true;
  if (immediate) {
    if (pendingFlush) { clearTimeout(pendingFlush); pendingFlush = null; }
    flush();
    return;
  }
  if (pendingFlush) return;
  pendingFlush = setTimeout(flush, FLUSH_MS);
}

function setState(patch, opts) {
  Object.assign(state, patch);
  notify(opts);
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Lightweight React hook so screens can re-render on every controller update.
 * Equivalent to subscribe()+useState, but avoids stale-closure pitfalls.
 */
export function useScanState() {
  const [s, setS] = useState(state);
  useEffect(() => {
    setS(state);
    return subscribe(setS);
  }, []);
  return s;
}

export function isRunning() {
  return state.phase === 'scanning';
}

export function abort() {
  if (abortFlag) abortFlag.aborted = true;
  if (state.phase === 'scanning') setState({ phase: 'aborted' });
}

export function reset() {
  abort();
  state = initialState();
  autoSaveQueue = [];
  autoSaveSeen = new Set();
  autoSaveFn = null;
  autoSavePlanMatches = [];
  notify({ immediate: true });
}

/**
 * Ensure auto-save workers are running. Idempotent — safe to call after
 * each scan batch. Workers exit when the queue is drained, then can be
 * re-spawned by the next batch.
 */
function pumpAutoSave() {
  if (!autoSaveFn) return;
  while (autoSaveActiveWorkers < AUTO_SAVE_GLOBAL_CONCURRENCY && autoSaveQueue.length > 0) {
    autoSaveActiveWorkers += 1;
    runAutoSaveWorker().finally(() => {
      autoSaveActiveWorkers -= 1;
    });
  }
}

async function runAutoSaveWorker() {
  while (autoSaveQueue.length > 0) {
    const item = autoSaveQueue.shift();
    const assetId = typeof item === 'string' ? item : item?.assetId;
    if (!assetId) continue;
    setState({ autoSaveQueueLength: autoSaveQueue.length });
    try {
      await autoSaveFn(assetId, typeof item === 'string' ? null : item);
      // Mark as saved (this also bumps savedCount + drops acceptedCount)
      markSaved([assetId]);
      setState({ autoSavedCount: state.autoSavedCount + 1 });
    } catch {
      console.warn('auto-save failed', { mediaType: item?.mediaType === 'video' ? 'video' : 'image' });
      setState({ autoSaveErrors: state.autoSaveErrors + 1 });
    }
  }
}

/**
 * Externally enqueue ids for auto-save (used to flush a previously
 * matched-but-unsaved backlog when the user re-opens the scanner).
 */
export function enqueueAutoSave(ids) {
  if (!autoSaveFn || !ids?.length) return;
  let added = 0;
  for (const id of ids) {
    if (!id || autoSaveSeen.has(id)) continue;
    autoSaveSeen.add(id);
    autoSaveQueue.push({ assetId: id });
    added += 1;
  }
  if (added > 0) {
    setState({ autoSaveQueueLength: autoSaveQueue.length });
    pumpAutoSave();
  }
}

/**
 * Toggle accepted state on a single match. Used by the review grid.
 */
export function setAccepted(assetId, accepted) {
  // Slice + replace one item is O(N) memory but avoids the O(N) work of
  // re-creating every other item object. React.memo on the tile relies on
  // prop identity, so the toggled item must get a fresh reference.
  const idx = state.matches.findIndex((m) => m.assetId === assetId);
  if (idx < 0) return;
  const old = state.matches[idx];
  if (old.accepted === accepted) return;
  const next = state.matches.slice();
  next[idx] = { ...old, accepted };
  const delta = accepted ? 1 : -1;
  setState({
    matches: next,
    acceptedCount: state.acceptedCount + (old.saved ? 0 : delta),
  }, { immediate: true });
}

/**
 * Bulk-set accepted on every match passing a predicate. Used by the
 * "Accept these" / "Skip these" filter actions.
 */
export function setAcceptedBulk(predicate, accepted) {
  let delta = 0;
  const matches = state.matches.map((m) => {
    if (!predicate(m)) return m;
    if (m.accepted === accepted) return m;
    if (!m.saved) delta += accepted ? 1 : -1;
    return { ...m, accepted };
  });
  setState({ matches, acceptedCount: state.acceptedCount + delta }, { immediate: true });
}

/**
 * Mark a set of matches as "saved" so the review grid can hide them
 * (or grey them out) once the upload completes.
 */
export function markSaved(ids) {
  const idSet = new Set(ids);
  let delta = 0;
  const matches = state.matches.map((m) => {
    if (!idSet.has(m.assetId) || m.saved) return m;
    if (m.accepted) delta -= 1;
    return { ...m, saved: true };
  });
  setState({
    matches,
    savedCount: state.savedCount + idSet.size,
    acceptedCount: state.acceptedCount + delta,
  }, { immediate: true });
}

/**
 * Kick off a scan. Idempotent: if a scan is already running, just returns
 * the active scanKey so the caller can subscribe to results.
 *
 *   start({
 *     reference, since, threshold,
 *     autoSave: { threshold?, save: async (assetId) => {} },
 *     excludeIds: Set<string>,
 *     onComplete: async (finalState) => {},
 *     onICloudWait: async ({ assetIds }) => {},
 *     onICloudReady: async ({ assetIds }) => {},
 *     onCandidates: async ({ matches, scanKey }) => {},
 *     onAssetsSeen: async ({ assetIds, scanKey }) => {},
 *   })
 *
 *   reference: { embedding: number[] }  – the baby's face embedding
 *   since:     epoch ms                – createdAfter filter
 *   threshold: number 0..1             – cosine similarity cutoff (default 0.6)
 *   autoSave:  optional and should only be supplied after calibration.
 *              Matches scoring at or above threshold are queued for
 *              background upload via the provided save function.
 *   excludeIds: asset IDs that should be skipped — typically photos that
 *               are already saved in Supabase.
 */
export async function start({
  reference,
  referenceProfile,
  birthdayISO,
  since,
  threshold,
  autoSave,
  excludeIds,
  extraAssetIds,
  extraAssetCreatedAfterMs,
  onComplete,
  onICloudWait,
  onICloudReady,
  onCandidates,
  onAssetsSeen,
  photoPageSize,
} = {}) {
  if (state.phase === 'scanning') return state.scanKey;

  const scanKey = `${Date.now()}`;
  abortFlag = { aborted: false };
  const me = abortFlag;

  // Reset queue + auto-save fn before starting; existing matches from a
  // prior session are dropped here so callers should call enqueueAutoSave
  // explicitly if they want to flush a stale backlog.
  autoSaveQueue = [];
  autoSaveSeen = new Set();
  autoSavePlanMatches = [];
  autoSaveFn = autoSave?.save || null;
  const autoSaveThreshold = autoSave?.threshold ?? AUTO_SAVE_THRESHOLD_DEFAULT;
  const skipSet = excludeIds instanceof Set
    ? excludeIds
    : new Set(Array.isArray(excludeIds) ? excludeIds : []);
  const extraIds = Array.isArray(extraAssetIds) ? extraAssetIds.filter(Boolean) : [];
  const resolvedPhotoPageSize = resolveScanPhotoPageSize(photoPageSize);
  const visitedAssetIds = new Set();

  state = {
    ...initialState(),
    phase: 'scanning',
    startedAt: Date.now(),
    scanKey,
  };
  notify();

  // Cheap probe — gives us a denominator for "X of Y media read".
  (async () => {
    try {
      const [photoTotal, videoTotal] = await Promise.all([
        countPhotosInWindow({ createdAfterMs: since }),
        countVideosInWindow({ createdAfterMs: since }),
      ]);
      if (!me.aborted && state.scanKey === scanKey) {
        setState({ total: photoTotal + videoTotal + extraIds.length });
      }
    } catch { /* non-fatal */ }
  })();

  try {
    const cutoff = threshold != null ? threshold : (isNative ? 0.6 : null);

    const reportICloudStatus = async (assets = []) => {
      if (!onICloudWait && !onICloudReady) return;
      const waiting = [];
      const ready = [];
      for (const asset of assets) {
        const status = asset?.downloadStatus;
        if (!status && !asset?.cloudWaitOnly) continue;
        const sourceId = asset.sourceAssetId || asset.id || asset.assetId;
        if (!sourceId) continue;
        if (status === 'ready') {
          ready.push(sourceId);
        } else if (asset.cloudWaitOnly || status === 'pending' || status === 'failed') {
          waiting.push(sourceId);
        }
      }
      try {
        if (ready.length) await onICloudReady?.({ assetIds: ready });
        if (waiting.length) await onICloudWait?.({ assetIds: waiting });
      } catch {
        console.warn('scan iCloud retry queue failed');
      }
    };

    const scoreAssets = async (assets = []) => {
      const freshAssets = [];
      for (const asset of assets) {
        const candidateId = asset?.candidateId || asset?.id;
        if (!candidateId || visitedAssetIds.has(candidateId)) continue;
        visitedAssetIds.add(candidateId);
        freshAssets.push(asset);
      }
      if (!freshAssets.length) return;
      await reportICloudStatus(freshAssets);
      if (onAssetsSeen) {
        const sourceAssetIds = [...new Set(
          freshAssets.map((asset) => asset.sourceAssetId || asset.id).filter(Boolean),
        )];
        if (sourceAssetIds.length) await onAssetsSeen({ assetIds: sourceAssetIds, scanKey });
      }
      const seenSourceIds = new Set(
        freshAssets.map((asset) => asset.sourceAssetId || asset.id).filter(Boolean),
      );
      if (!me.aborted && seenSourceIds.size) {
        setState({ seen: state.seen + seenSourceIds.size });
      }

      const candidates = freshAssets
        .filter((a) => !a.cloudWaitOnly && (a.localUri || a.uri) && !skipSet.has(a.sourceAssetId || a.id))
        .map((a) => ({
          assetId: a.candidateId || a.id,
          sourceAssetId: a.sourceAssetId || a.id,
          mediaType: a.mediaType || 'image',
          localUri: a.localUri || a.uri,
          previewUri: a.previewUri || a.localUri || a.uri,
          creationTime: a.creationTime,
          frameTimeMs: a.frameTimeMs,
          duration: a.duration,
          videoUri: a.videoUri,
          fileName: a.fileName,
        }));

      const scored = candidates.length
        ? await matchAgainstReferenceProfile({
          profile: referenceProfile,
          birthdayISO,
          fallbackReference: reference,
          candidates,
        })
        : [];
      const newMatchesRaw = collapseScoredMediaCandidates({
        candidates,
        scored,
        cutoff,
      });
      const seenIds = new Set(state.matches.map((m) => m.assetId));
      const newMatches = [];
      for (const match of newMatchesRaw) {
        if (!match?.assetId || seenIds.has(match.assetId)) continue;
        seenIds.add(match.assetId);
        newMatches.push(match);
      }

      if (me.aborted) return;

      // The durable private ledger owns the historical backlog. Awaiting this
      // bounded batch before continuing means cancellation or termination can
      // lose at most the native analysis currently in flight, never prior pages.
      if (newMatches.length) {
        await onCandidates?.({ matches: newMatches, scanKey });
      }

      // Update incremental counters so React screens don't have to.
      let addHigh = 0; let addBorder = 0;
      for (const m of newMatches) {
        if ((m.score ?? 0) >= HIGH_THRESHOLD) addHigh++; else addBorder++;
      }

      // Append in scan order (newest creationTime first), so the grid
      // grows naturally as the user scrolls.
      const liveMatches = state.matches.concat(newMatches).slice(0, CANDIDATE_LIVE_MATCH_LIMIT);
      setState({
        matches: liveMatches,
        totalMatchCount: state.totalMatchCount + newMatches.length,
        acceptedCount: state.acceptedCount + newMatches.length,
        highCount: state.highCount + addHigh,
        borderlineCount: state.borderlineCount + addBorder,
      });

      if (autoSaveFn && newMatches.length) {
        const rollingPlan = buildDailyCurationPlan(autoSavePlanMatches.concat(newMatches), {
          minIdentityScore: autoSaveThreshold,
          autoSaveOnly: true,
          autoSaveScoreThreshold: autoSaveThreshold,
        });
        autoSavePlanMatches = rollingPlan.selectedMatches.slice(0, CANDIDATE_LIVE_MATCH_LIMIT);
      }

    };

    if (extraIds.length) {
      const extraAssets = await fetchMediaScanCandidatesByIds(extraIds, {
        createdAfterMs: extraAssetCreatedAfterMs,
      });
      if (!me.aborted) await scoreAssets(extraAssets);
    }

    let page = await fetchPhotoPage(undefined, since, resolvedPhotoPageSize);

    while (true) {
      if (me.aborted) break;

      if (page.assets.length === 0) break;

      const nextPagePromise =
        page.hasNextPage && !me.aborted
          ? fetchPhotoPage(page.endCursor, since, resolvedPhotoPageSize)
          : null;

      await scoreAssets(page.assets);

      if (!page.hasNextPage) break;
      if (!nextPagePromise) break;
      page = await nextPagePromise;
    }

    let videoPage = await fetchVideoFrameCandidatesPage({
      pageSize: VIDEO_PAGE_SIZE,
      createdAfterMs: since,
    });

    while (true) {
      if (me.aborted) break;

      if (videoPage.assets.length) await scoreAssets(videoPage.assets);
      if (!videoPage.hasNextPage) break;
      videoPage = await fetchVideoFrameCandidatesPage({
        after: videoPage.endCursor,
        pageSize: VIDEO_PAGE_SIZE,
        createdAfterMs: since,
      });
    }

    // Curate only after every page and sampled video has been compared.
    // This prevents an early soft frame from saving before the strongest
    // daily representative is known.
    if (!me.aborted && autoSaveFn && autoSavePlanMatches.length) {
      const autoPlan = buildDailyCurationPlan(autoSavePlanMatches, {
        minIdentityScore: autoSaveThreshold,
        autoSaveOnly: true,
        autoSaveScoreThreshold: autoSaveThreshold,
      });
      const autoMatches = autoPlan.selectedMatches.filter((match) => !autoSaveSeen.has(match.assetId));
      for (const match of autoMatches) autoSaveSeen.add(match.assetId);
      if (autoMatches.length) {
        autoSaveQueue.push(...autoMatches);
        setState({ autoSaveQueueLength: autoSaveQueue.length });
        pumpAutoSave();
      }
    }

    if (me.aborted) {
      setState({ phase: 'aborted', finishedAt: Date.now() }, { immediate: true });
    } else {
      setState({ phase: 'done', finishedAt: Date.now() }, { immediate: true });
    }
  } catch (e) {
    setState({ phase: 'failed', error: e?.message || String(e), finishedAt: Date.now() }, { immediate: true });
  }

  try {
    await onComplete?.(state);
  } catch {
    console.warn('scan completion callback failed');
  }

  return scanKey;
}

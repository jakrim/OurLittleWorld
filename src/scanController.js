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
 *     seen:     number,            // photos read by MediaLibrary so far
 *     total:    number | null,     // total photos in birthday→now window
 *     matches:  Array<Match>,      // appended as batches finish (newest first)
 *     errors:   number,
 *     error:    string | null,
 *     startedAt: number | null,
 *   }
 *
 * Match shape:
 *   { assetId, score, faceCount, creationTime, uri, accepted, saved }
 */

import { useEffect, useState } from 'react';
import { countPhotosInWindow, fetchPhotosPage } from './photos';
import { matchAgainst, isNative } from './faceMatcher';

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
});

const HIGH_THRESHOLD = 0.75;
const AUTO_SAVE_THRESHOLD_DEFAULT = 0.78; // a hair above borderline
const AUTO_SAVE_CONCURRENCY = 3;
const PAGE_SIZE = 60;

function fetchPhotoPage(after, since) {
  return fetchPhotosPage({
    after,
    pageSize: PAGE_SIZE,
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
    const assetId = autoSaveQueue.shift();
    if (!assetId) continue;
    setState({ autoSaveQueueLength: autoSaveQueue.length });
    try {
      await autoSaveFn(assetId);
      // Mark as saved (this also bumps savedCount + drops acceptedCount)
      markSaved([assetId]);
      setState({ autoSavedCount: state.autoSavedCount + 1 });
    } catch (e) {
      console.warn('auto-save failed', assetId, e?.message);
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
    autoSaveQueue.push(id);
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
 *   })
 *
 *   reference: { embedding: number[] }  – the baby's face embedding
 *   since:     epoch ms                – createdAfter filter
 *   threshold: number 0..1             – cosine similarity cutoff (default 0.6)
 *   autoSave:  if set, every match scoring ≥ threshold is queued for
 *              background upload via the provided save function. The
 *              user never has to press Save for these.
 *   excludeIds: asset IDs that should be skipped — typically photos that
 *               are already saved in Supabase.
 */
export async function start({
  reference,
  since,
  threshold,
  autoSave,
  excludeIds,
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
  autoSaveFn = autoSave?.save || null;
  const autoSaveThreshold = autoSave?.threshold ?? AUTO_SAVE_THRESHOLD_DEFAULT;
  const skipSet = excludeIds instanceof Set
    ? excludeIds
    : new Set(Array.isArray(excludeIds) ? excludeIds : []);

  state = {
    ...initialState(),
    phase: 'scanning',
    startedAt: Date.now(),
    scanKey,
  };
  notify();

  // Cheap probe — gives us a denominator for "X of Y photos read".
  (async () => {
    try {
      const total = await countPhotosInWindow({ createdAfterMs: since });
      if (!me.aborted && state.scanKey === scanKey) {
        setState({ total });
      }
    } catch { /* non-fatal */ }
  })();

  try {
    const cutoff = threshold != null ? threshold : (isNative ? 0.6 : null);

    let page = await fetchPhotoPage(undefined, since);

    while (true) {
      if (me.aborted) break;

      if (page.assets.length === 0) break;

      const nextPagePromise =
        page.hasNextPage && !me.aborted ? fetchPhotoPage(page.endCursor, since) : null;

      const candidates = page.assets
        .filter((a) => !skipSet.has(a.id))
        .map((a) => ({
          assetId: a.id,
          localUri: a.localUri || a.uri,
          creationTime: a.creationTime,
        }));

      let scored = candidates.length
        ? await matchAgainst({ reference, candidates })
        : [];
      if (cutoff != null) scored = scored.filter((s) => s.score >= cutoff);

      const byId = new Map(candidates.map((c) => [c.assetId, c]));
      const newMatchesRaw = scored.map((s) => {
        const c = byId.get(s.assetId);
        return {
          assetId: s.assetId,
          score: s.score,
          faceCount: s.faceCount,
          creationTime: c?.creationTime,
          uri: c?.localUri, // ph:// works for expo-image directly — no getAssetInfoAsync needed
          accepted: true,
          saved: false,
        };
      });
      const seenIds = new Set(state.matches.map((m) => m.assetId));
      const newMatches = [];
      for (const match of newMatchesRaw) {
        if (!match?.assetId || seenIds.has(match.assetId)) continue;
        seenIds.add(match.assetId);
        newMatches.push(match);
      }

      if (me.aborted) break;

      // Update incremental counters so React screens don't have to.
      let addHigh = 0; let addBorder = 0;
      for (const m of newMatches) {
        if ((m.score ?? 0) >= HIGH_THRESHOLD) addHigh++; else addBorder++;
      }

      // Append in scan order (newest creationTime first), so the grid
      // grows naturally as the user scrolls.
      setState({
        seen: state.seen + page.assets.length,
        matches: state.matches.concat(newMatches),
        acceptedCount: state.acceptedCount + newMatches.length,
        highCount: state.highCount + addHigh,
        borderlineCount: state.borderlineCount + addBorder,
      });

      // Auto-queue high-confidence matches for background upload. The
      // borderline ones still get reviewed manually so the user gets
      // final say on questionable shots.
      if (autoSaveFn && newMatches.length) {
        const autoIds = [];
        for (const m of newMatches) {
          if ((m.score ?? 0) < autoSaveThreshold) continue;
          if (autoSaveSeen.has(m.assetId)) continue;
          autoSaveSeen.add(m.assetId);
          autoIds.push(m.assetId);
        }
        if (autoIds.length) {
          autoSaveQueue.push(...autoIds);
          setState({ autoSaveQueueLength: autoSaveQueue.length });
          pumpAutoSave();
        }
      }

      if (!page.hasNextPage) break;
      if (!nextPagePromise) break;
      page = await nextPagePromise;
    }

    if (me.aborted) {
      setState({ phase: 'aborted', finishedAt: Date.now() }, { immediate: true });
    } else {
      setState({ phase: 'done', finishedAt: Date.now() }, { immediate: true });
    }
  } catch (e) {
    setState({ phase: 'failed', error: e?.message || String(e), finishedAt: Date.now() }, { immediate: true });
  }

  return scanKey;
}

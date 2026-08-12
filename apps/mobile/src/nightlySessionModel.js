import { NIGHTLY_QUEUE_MIN } from './nightlyQueueModel.js';

export function isNightlySessionContinuation(session) {
  return Number(session?.is_continuation || 0) === 1;
}

export function nightlySessionScanTrigger({ phase = 'idle', checked = 0 } = {}) {
  return {
    phase: phase || 'idle',
    // Scan.checked advances only after analysis is durably written. Deliberately
    // omit fetched/seen counters so asset reads alone cannot refresh Today.
    durableRevision: Math.max(0, Number(checked) || 0),
  };
}

/**
 * Do not freeze a new nightly session around the first one or two matches in
 * an active scan. Once three strong candidates are ready, prepare the set;
 * when the scan stops, surface a truthful smaller set instead of padding it.
 * Existing active/completed sessions remain readable throughout a scan.
 */
export function shouldPrepareNightlySession({
  summary = null,
  scanPhase = 'idle',
} = {}) {
  if (summary?.sessionId) return true;
  const availableCount = Math.max(0, Number(summary?.count) || 0);
  if (availableCount === 0) return false;
  if (scanPhase !== 'scanning') return true;
  return availableCount >= NIGHTLY_QUEUE_MIN;
}

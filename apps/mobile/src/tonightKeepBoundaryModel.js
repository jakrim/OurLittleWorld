const PREPUBLICATION_RECOVERY_CODES = new Set(['asset_unavailable', 'capture_time_unknown']);

export function tonightKeepHasCanonicalSideEffect(item = {}) {
  const candidate = item || {};
  return candidate.canonicalSideEffectStarted === true
    || Number(candidate.canonicalSideEffectStarted || candidate.canonical_side_effect_started || 0) === 1
    || Boolean(candidate.canonicalMomentId || candidate.canonical_moment_id);
}

export function canAbandonTonightKeep(item = {}) {
  const candidate = item || {};
  if (!['saving', 'failed'].includes(candidate.commitState || candidate.commit_state)) return true;
  const errorCode = candidate.lastErrorCode || candidate.last_error_code;
  return PREPUBLICATION_RECOVERY_CODES.has(errorCode) && !tonightKeepHasCanonicalSideEffect(candidate);
}

export function tonightKeepNeedsRemoteReconciliation(item = {}) {
  const candidate = item || {};
  if (!['saving', 'failed'].includes(candidate.commitState || candidate.commit_state)) return false;
  const errorCode = candidate.lastErrorCode || candidate.last_error_code;
  return PREPUBLICATION_RECOVERY_CODES.has(errorCode) && !tonightKeepHasCanonicalSideEffect(candidate);
}

export function assertTonightKeepAbandonmentConfirmed(item = {}, remoteAbsenceConfirmed = false) {
  if (tonightKeepNeedsRemoteReconciliation(item) && remoteAbsenceConfirmed !== true) {
    throw new Error('Confirm this Keep has no shared side effects before abandoning it');
  }
}

export function tonightKeepNeedsRetry(item = {}) {
  const candidate = item || {};
  return ['saving', 'failed'].includes(candidate.commitState || candidate.commit_state)
    && !canAbandonTonightKeep(candidate);
}

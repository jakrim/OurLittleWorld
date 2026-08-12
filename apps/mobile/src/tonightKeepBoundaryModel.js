export function tonightKeepHasCanonicalSideEffect(item = {}) {
  return item.canonicalSideEffectStarted === true
    || Number(item.canonicalSideEffectStarted || item.canonical_side_effect_started || 0) === 1
    || Boolean(item.canonicalMomentId || item.canonical_moment_id);
}

export function canAbandonTonightKeep(item = {}) {
  if (!['saving', 'failed'].includes(item.commitState || item.commit_state)) return true;
  const errorCode = item.lastErrorCode || item.last_error_code;
  return errorCode === 'asset_unavailable' && !tonightKeepHasCanonicalSideEffect(item);
}

export function tonightKeepNeedsRetry(item = {}) {
  return ['saving', 'failed'].includes(item.commitState || item.commit_state)
    && !canAbandonTonightKeep(item);
}

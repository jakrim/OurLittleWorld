import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertTonightKeepAbandonmentConfirmed,
  canAbandonTonightKeep,
  tonightKeepHasCanonicalSideEffect,
  tonightKeepNeedsRemoteReconciliation,
  tonightKeepNeedsRetry,
} from '../../src/tonightKeepBoundaryModel.js';

test('an unloaded Tonight item is a safe idle boundary', () => {
  assert.equal(tonightKeepHasCanonicalSideEffect(null), false);
  assert.equal(canAbandonTonightKeep(null), true);
  assert.equal(tonightKeepNeedsRemoteReconciliation(null), false);
  assert.equal(tonightKeepNeedsRetry(null), false);
});

test('an unavailable Photos asset can be abandoned before its first canonical side effect', () => {
  const item = {
    commitState: 'failed',
    lastErrorCode: 'asset_unavailable',
    canonicalSideEffectStarted: false,
  };
  assert.equal(canAbandonTonightKeep(item), true);
  assert.equal(tonightKeepNeedsRetry(item), false);
  assert.equal(tonightKeepNeedsRemoteReconciliation(item), true);
  assert.throws(
    () => assertTonightKeepAbandonmentConfirmed(item),
    /Confirm this Keep has no shared side effects/,
  );
  assert.doesNotThrow(() => assertTonightKeepAbandonmentConfirmed(item, true));
});

test('an unavailable Photos asset remains locked after a canonical side effect', () => {
  const item = {
    commitState: 'failed',
    lastErrorCode: 'asset_unavailable',
    canonicalSideEffectStarted: true,
  };
  assert.equal(canAbandonTonightKeep(item), false);
  assert.equal(tonightKeepNeedsRetry(item), true);
});

test('an unknown capture date can be retried or replaced only before publication starts', () => {
  const beforePublication = {
    commitState: 'failed',
    lastErrorCode: 'capture_time_unknown',
    canonicalSideEffectStarted: false,
  };
  assert.equal(canAbandonTonightKeep(beforePublication), true);
  assert.equal(tonightKeepNeedsRetry(beforePublication), false);
  assert.equal(tonightKeepNeedsRemoteReconciliation(beforePublication), true);

  assert.equal(canAbandonTonightKeep({
    ...beforePublication,
    canonicalSideEffectStarted: true,
  }), false);
});

test('a persisted canonical moment also locks legacy partial Keeps', () => {
  assert.equal(canAbandonTonightKeep({
    commit_state: 'failed',
    last_error_code: 'asset_unavailable',
    canonical_moment_id: 'moment-1',
  }), false);
});

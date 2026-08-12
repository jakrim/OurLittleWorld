import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canAbandonTonightKeep,
  tonightKeepNeedsRetry,
} from '../../src/tonightKeepBoundaryModel.js';

test('an unavailable Photos asset can be abandoned before its first canonical side effect', () => {
  const item = {
    commitState: 'failed',
    lastErrorCode: 'asset_unavailable',
    canonicalSideEffectStarted: false,
  };
  assert.equal(canAbandonTonightKeep(item), true);
  assert.equal(tonightKeepNeedsRetry(item), false);
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

test('a persisted canonical moment also locks legacy partial Keeps', () => {
  assert.equal(canAbandonTonightKeep({
    commit_state: 'failed',
    last_error_code: 'asset_unavailable',
    canonical_moment_id: 'moment-1',
  }), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { completeCanonicalKeep } from '../../src/canonicalKeepCompletionModel.js';

test('candidate and Today reconciliation wait for canonical Keep success', async () => {
  let resolveSave;
  const calls = [];
  const pendingSave = new Promise((resolve) => { resolveSave = resolve; });
  const completion = completeCanonicalKeep({
    save: () => pendingSave,
    reconcileCandidate: () => { calls.push('candidate'); },
    invalidateHome: () => { calls.push('home'); },
  });

  await Promise.resolve();
  assert.deepEqual(calls, [], 'a pending mapping/upload is not treated as a successful Keep');

  resolveSave({ momentId: 'moment-1' });
  assert.deepEqual(await completion, { momentId: 'moment-1' });
  assert.deepEqual(calls, ['candidate', 'home']);
});

test('an interrupted Keep preserves the candidate queue and cached Today payload', async () => {
  const state = { candidate: 'queued', cachedHome: ['existing-memory'] };
  await assert.rejects(
    completeCanonicalKeep({
      save: async () => { throw new Error('publication interrupted'); },
      reconcileCandidate: () => { state.candidate = 'kept'; },
      invalidateHome: () => { state.cachedHome = []; },
    }),
    /publication interrupted/,
  );
  assert.deepEqual(state, { candidate: 'queued', cachedHome: ['existing-memory'] });
});

test('a successful Keep reconciles once and removes stale Today data', async () => {
  const state = { candidateWrites: 0, cachedHome: ['pre-keep-memory'] };
  await completeCanonicalKeep({
    save: async () => ({ momentId: 'moment-1' }),
    reconcileCandidate: () => { state.candidateWrites += 1; },
    invalidateHome: () => { state.cachedHome = null; },
  });
  assert.deepEqual(state, { candidateWrites: 1, cachedHome: null });
});

test('Today is invalidated even when post-success ledger repair must be retried', async () => {
  let invalidated = false;
  await assert.rejects(completeCanonicalKeep({
    save: async () => ({ momentId: 'moment-1' }),
    reconcileCandidate: async () => { throw new Error('local database unavailable'); },
    invalidateHome: async () => { invalidated = true; },
  }), /local database unavailable/);
  assert.equal(invalidated, true);
});

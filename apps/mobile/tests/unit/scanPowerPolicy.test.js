import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readAutoIngestPowerGate,
  shouldPauseAutoIngestForPowerState,
} from '../../src/scanPowerPolicy.js';

test('automatic discovery pauses for either supported low-power flag', () => {
  assert.equal(shouldPauseAutoIngestForPowerState({ lowPowerMode: true }), true);
  assert.equal(shouldPauseAutoIngestForPowerState({ lowPowerModeEnabled: true }), true);
  assert.equal(shouldPauseAutoIngestForPowerState({ lowPowerMode: false }), false);
  assert.equal(shouldPauseAutoIngestForPowerState(null), false);
});

test('power gate uses the Expo Battery power-state API', async () => {
  let calls = 0;
  const paused = await readAutoIngestPowerGate({
    Battery: {
      getPowerStateAsync: async () => {
        calls += 1;
        return { lowPowerMode: true };
      },
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(paused, { shouldPause: true, reason: 'low-power-mode' });
});

test('power gate allows automatic discovery at normal power', async () => {
  const gate = await readAutoIngestPowerGate({
    Battery: { getPowerStateAsync: async () => ({ lowPowerMode: false }) },
  });
  assert.deepEqual(gate, { shouldPause: false, reason: null });
});

test('power gate fails open when a development client lacks battery support', async () => {
  assert.deepEqual(
    await readAutoIngestPowerGate({ Battery: null }),
    { shouldPause: false, reason: 'power-state-unavailable' },
  );
  assert.deepEqual(
    await readAutoIngestPowerGate({
      Battery: { getPowerStateAsync: async () => { throw new Error('native unavailable'); } },
    }),
    { shouldPause: false, reason: 'power-state-unavailable' },
  );
});

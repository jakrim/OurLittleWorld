import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldCommitRitualHomeRefresh } from '../../src/ritualHomeCacheModel.js';

test('a pre-Keep Today request cannot overwrite the invalidated cache when it resolves late', () => {
  assert.equal(shouldCommitRitualHomeRefresh({ startedRevision: 4, currentRevision: 5 }), false);
});

test('a post-Keep Today request can publish into the current cache revision', () => {
  assert.equal(shouldCommitRitualHomeRefresh({ startedRevision: 5, currentRevision: 5 }), true);
});

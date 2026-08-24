import assert from 'node:assert/strict';
import { test } from 'node:test';

import { promptStarterForToday } from '../../src/promptStarterModel.js';

const NOW = new Date(2026, 6, 6, 20);

function photo(hour, day = 6) {
  return { creation_time: new Date(2026, 6, day, hour).toISOString() };
}

test('prompt starter counts today photos and names the latest time of day', () => {
  assert.equal(
    promptStarterForToday({ sharedPhotos: [photo(9), photo(14), photo(15)], now: NOW }),
    'Today we saved 3 moments — one from this afternoon.',
  );
  assert.equal(
    promptStarterForToday({ sharedPhotos: [photo(9)], now: NOW }),
    'Today we saved one moment, from this morning.',
  );
  assert.equal(
    promptStarterForToday({ sharedPhotos: [photo(19)], now: NOW }),
    'Today we saved one moment, from this evening.',
  );
});

test('prompt starter is empty when nothing was saved today — no filler', () => {
  assert.equal(promptStarterForToday({ sharedPhotos: [photo(12, 5)], now: NOW }), '');
  assert.equal(promptStarterForToday({ sharedPhotos: [], now: NOW }), '');
  assert.equal(promptStarterForToday({ sharedPhotos: [{ creation_time: 'junk' }], now: NOW }), '');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AUTO_SAVE_CAPTURE_QUALITY_FLOOR,
  shouldAutoSaveMatch,
} from '../../src/scanQualityModel.js';

test('auto-save quality floor is a named tunable constant', () => {
  assert.equal(AUTO_SAVE_CAPTURE_QUALITY_FLOOR, 0.25);
});

test('low capture quality routes high-score matches to review', () => {
  assert.equal(
    shouldAutoSaveMatch({ score: 0.96, captureQuality: AUTO_SAVE_CAPTURE_QUALITY_FLOOR - 0.01 }, { scoreThreshold: 0.9 }),
    false,
  );
  assert.equal(
    shouldAutoSaveMatch({ score: 0.96, captureQuality: AUTO_SAVE_CAPTURE_QUALITY_FLOOR }, { scoreThreshold: 0.9 }),
    true,
  );
});

test('missing capture quality preserves score-threshold behavior', () => {
  assert.equal(shouldAutoSaveMatch({ score: 0.96 }, { scoreThreshold: 0.9 }), true);
  assert.equal(shouldAutoSaveMatch({ score: 0.86 }, { scoreThreshold: 0.9 }), false);
});

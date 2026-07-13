import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SCAN_AUTO_SAVE_SOURCE,
  buildScanAutoSaveGate,
  buildScanAutoSaveRuntimePlan,
  selectScanAutoSaveMatches,
} from '../../src/scanAutoSaveModel.js';
import {
  TRUST_AUTO_SAVE_THRESHOLD,
  TRUST_CLEAN_BATCH_MIN,
} from '../../src/photoIngestionTrustModel.js';
import { AUTO_SAVE_CAPTURE_QUALITY_FLOOR } from '../../src/scanQualityModel.js';

const cleanCorrections = () => Array.from({ length: TRUST_CLEAN_BATCH_MIN }, (_, index) => ({
  assetId: `asset-${index}`,
  score: 0.94,
  verdict: 'keep',
}));

test('scan auto-save gate starts review-first before trust is earned', () => {
  const gate = buildScanAutoSaveGate({ calibration: null });

  assert.equal(gate.enabled, false);
  assert.equal(gate.configuredEnabled, false);
  assert.equal(gate.trustEarned, false);
  assert.equal(gate.threshold, TRUST_AUTO_SAVE_THRESHOLD);
  assert.equal(gate.reason, 'trust-not-earned');
  assert.equal(gate.source, SCAN_AUTO_SAVE_SOURCE);
});

test('scan auto-save gate waits for parent opt-in after clean review earns trust', () => {
  const gate = buildScanAutoSaveGate({
    calibration: {
      autoSaveEnabled: false,
      corrections: cleanCorrections(),
    },
  });

  assert.equal(gate.enabled, false);
  assert.equal(gate.trustEarned, true);
  assert.equal(gate.reason, 'review-first-selected');
});

test('scan auto-save gate opens only after trust and parent auto-save setting are present', () => {
  const gate = buildScanAutoSaveGate({
    calibration: {
      autoSaveEnabled: true,
      autoSaveThreshold: 0.91,
      corrections: cleanCorrections(),
    },
  });

  assert.equal(gate.enabled, true);
  assert.equal(gate.trustEarned, true);
  assert.equal(gate.threshold, 0.91);
  assert.equal(gate.reason, null);
});

test('scan auto-save selection keeps low-quality, borderline, and duplicate matches in review', () => {
  const selected = selectScanAutoSaveMatches([
    { assetId: 'asset-clear', score: 0.96, captureQuality: AUTO_SAVE_CAPTURE_QUALITY_FLOOR },
    { assetId: 'asset-soft', score: 0.97, captureQuality: AUTO_SAVE_CAPTURE_QUALITY_FLOOR - 0.01 },
    { assetId: 'asset-borderline', score: 0.89, captureQuality: 0.9 },
    { assetId: 'asset-seen', score: 0.99, captureQuality: 0.9 },
  ], {
    scoreThreshold: 0.9,
    seenAssetIds: new Set(['asset-seen']),
  });

  assert.deepEqual(selected.map((match) => match.assetId), ['asset-clear']);
});

test('scan auto-save runtime plan splits auto-saves from review matches', () => {
  const plan = buildScanAutoSaveRuntimePlan({
    calibration: {
      autoSaveEnabled: true,
      corrections: cleanCorrections(),
    },
    matches: [
      { assetId: 'asset-clear', score: 0.96, captureQuality: 0.9 },
      { assetId: 'asset-review', score: 0.82, captureQuality: 0.9 },
    ],
  });

  assert.equal(plan.enabled, true);
  assert.deepEqual(plan.autoSaveMatches.map((match) => match.assetId), ['asset-clear']);
  assert.deepEqual(plan.reviewMatches.map((match) => match.assetId), ['asset-review']);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AUTO_SAVE_MODE_AUTO,
  AUTO_SAVE_MODE_REVIEW_FIRST,
  TRUST_AUTO_SAVE_THRESHOLD,
  TRUST_CAPTURE_QUALITY_FLOOR,
  TRUST_CLEAN_BATCH_MIN,
  TRUST_HIGH_CONFIDENCE_SCORE,
  buildPhotoIngestionTrustModel,
  hasEarnedAutoSaveTrust,
} from '../../src/photoIngestionTrustModel.js';

const highKeep = (assetId) => ({ assetId, score: 0.93, verdict: 'keep' });
const highSkip = (assetId) => ({ assetId, score: 0.91, verdict: 'skip' });

test('first scan requires review before auto-save', () => {
  const model = buildPhotoIngestionTrustModel({
    pendingReviewCount: 4,
    babyName: 'Reuben',
    childId: 'child-a',
  });

  assert.equal(model.state, 'review_required');
  assert.equal(model.childId, 'child-a');
  assert.deepEqual(model.referenceScope, { kind: 'child', childId: 'child-a' });
  assert.equal(model.route, '/review');
  assert.match(model.title, /4 likely photos/);
  assertNoRawTunables(model);
});

test('small first scan still requires parent review', () => {
  const model = buildPhotoIngestionTrustModel({
    pendingReviewCount: 1,
  });

  assert.equal(model.state, 'review_required');
  assert.equal(model.route, '/review');
  assert.equal(model.todayNudge.kind, 'photo-trust');
  assertNoRawTunables(model);
});

test('empty first scan state does not take over Today', () => {
  const model = buildPhotoIngestionTrustModel();

  assert.equal(model.state, 'review_required');
  assert.equal(model.todayNudge, null);
  assertNoRawTunables(model);
});

test('clean review batch can make auto-save ready without exposing tunables', () => {
  const model = buildPhotoIngestionTrustModel({
    calibration: {
      autoSaveEnabled: false,
      corrections: Array.from({ length: TRUST_CLEAN_BATCH_MIN }, (_, index) => highKeep(`asset-${index}`)),
    },
  });

  assert.equal(model.state, 'auto_save_ready');
  assert.equal(model.autoSaveTrustEarned, true);
  assert.equal(model.autoSaveEnabled, false);
  assert.equal(model.autoSaveSetting.available, true);
  assert.equal(model.autoSaveSetting.value, AUTO_SAVE_MODE_REVIEW_FIRST);
  assert.match(model.autoSaveSetting.body, /Review first is selected/);
  assert.match(model.autoSaveSetting.body, /Saved memories stay in Book/);
  assert.match(model.autoSaveSetting.footnote, /never deletes saved memories or Photos originals/);
  assert.equal(model.tunables.cleanBatchMin, TRUST_CLEAN_BATCH_MIN);
  assert.equal(model.tunables.highConfidenceScore, TRUST_HIGH_CONFIDENCE_SCORE);
  assert.equal(model.tunables.autoSaveThreshold, TRUST_AUTO_SAVE_THRESHOLD);
  assert.equal(model.tunables.captureQualityFloor, TRUST_CAPTURE_QUALITY_FLOOR);
  assertNoRawTunables(model);
});

test('rejected high-confidence match keeps the model learning', () => {
  const model = buildPhotoIngestionTrustModel({
    calibration: {
      corrections: [
        highKeep('asset-1'),
        highSkip('asset-2'),
      ],
    },
  });

  assert.equal(model.state, 'learning');
  assertNoRawTunables(model);
});

test('small later clean batch does not turn off active auto-save', () => {
  const model = buildPhotoIngestionTrustModel({
    calibration: {
      autoSaveEnabled: true,
      corrections: Array.from({ length: TRUST_CLEAN_BATCH_MIN }, (_, index) => highKeep(`asset-${index}`)),
    },
    pendingReviewCount: 1,
  });

  assert.equal(model.state, 'auto_save_active');
  assert.equal(model.autoSaveSetting.value, AUTO_SAVE_MODE_AUTO);
});

test('active auto-save reports recent assistant saves', () => {
  const model = buildPhotoIngestionTrustModel({
    calibration: {
      autoSaveEnabled: true,
      corrections: Array.from({ length: TRUST_CLEAN_BATCH_MIN }, (_, index) => highKeep(`asset-${index}`)),
    },
    recentAutoSaves: [{ assetId: 'asset-1' }, { assetId: 'asset-2' }],
  });

  assert.equal(model.state, 'auto_save_active');
  assert.equal(model.todayNudge.route, '/library');
  assert.match(model.title, /2 clear matches/);
  assert.match(model.autoSaveSetting.body, /same review setting/);
  assert.match(model.autoSaveSetting.body, /low-quality matches still wait for review/);
});

test('auto-save enabled flag is ignored until trust is earned', () => {
  const model = buildPhotoIngestionTrustModel({
    calibration: {
      autoSaveEnabled: true,
      corrections: [highKeep('asset-1')],
    },
  });

  assert.equal(model.state, 'learning');
  assert.equal(model.autoSaveTrustEarned, false);
  assert.equal(model.autoSaveEnabled, false);
  assert.equal(model.autoSaveSetting.available, false);
  assert.match(model.autoSaveSetting.body, /Auto-save becomes available/);
});

test('removed auto-save asks for correction review', () => {
  const model = buildPhotoIngestionTrustModel({
    calibration: { autoSaveEnabled: true },
    negativeExamples: [{ assetId: 'asset-1', score: 0.95, verdict: 'removed' }],
  });

  assert.equal(model.state, 'needs_correction_review');
  assert.equal(model.route, '/scan');
  assertNoRawTunables(model);
});

test('auto-save errors ask for review', () => {
  const model = buildPhotoIngestionTrustModel({
    calibration: { autoSaveEnabled: true },
    autoSaveErrors: 1,
  });

  assert.equal(model.state, 'needs_correction_review');
  assert.equal(model.todayNudge.kind, 'photo-trust');
});

test('co-parent or new-device scope starts with review on this device', () => {
  const model = buildPhotoIngestionTrustModel({
    calibration: { autoSaveEnabled: true },
    hasDeviceReference: false,
    babyName: 'Reuben',
  });

  assert.equal(model.state, 'review_required');
  assert.match(model.body, /this device/);
  assertNoRawTunables(model);
});

test('earned auto-save trust requires a clean high-confidence review history', () => {
  assert.equal(hasEarnedAutoSaveTrust({
    corrections: Array.from({ length: TRUST_CLEAN_BATCH_MIN }, (_, index) => highKeep(`asset-${index}`)),
  }), true);
  assert.equal(hasEarnedAutoSaveTrust({
    corrections: [
      ...Array.from({ length: TRUST_CLEAN_BATCH_MIN }, (_, index) => highKeep(`asset-${index}`)),
      highSkip('asset-skip'),
    ],
  }), false);
  assert.equal(hasEarnedAutoSaveTrust({
    corrections: Array.from({ length: TRUST_CLEAN_BATCH_MIN }, (_, index) => highKeep(`asset-${index}`)),
    negativeExamples: [{ assetId: 'asset-removed', score: 0.96, verdict: 'removed' }],
  }), false);
});

function assertNoRawTunables(model) {
  const setting = model.autoSaveSetting || {};
  const text = `${model.title} ${model.body} ${model.actionLabel} ${setting.title || ''} ${setting.body || ''} ${setting.footnote || ''}`;
  assert.equal(/threshold|confidence|0\.\d|calibration/i.test(text), false);
}

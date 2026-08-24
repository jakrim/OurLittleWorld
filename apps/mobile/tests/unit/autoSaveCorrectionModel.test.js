import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AUTO_SAVE_CORRECTION_COPY,
  AUTO_SAVE_CORRECTION_REVIEW_THRESHOLD,
  autoSaveCorrectionNeedsReview,
  autoSaveCorrectionTarget,
  isAutoSavedMemory,
} from '../../src/autoSaveCorrectionModel.js';

test('auto-save correction detects durable scan-auto-save metadata', () => {
  assert.equal(isAutoSavedMemory({ moment_media: { metadata: { source: 'scan-auto-save' } } }), true);
  assert.equal(isAutoSavedMemory({ metadata: { source: 'library-review' } }), false);
});

test('auto-save correction target normalizes tag rows and matcher signals', () => {
  const target = autoSaveCorrectionTarget({
    asset_id: 'asset-1',
    asset_owner_user_id: 'parent-1',
    child_id: 'child-a',
    moment_id: 'moment-1',
    moment_media_id: 'media-1',
    creation_time: '2026-07-09T12:00:00.000Z',
    moment_media: {
      media_type: 'image',
      metadata: {
        source: 'scan-auto-save',
        recognitionScore: 0.94,
        captureQuality: 0.82,
        faceCount: 1,
      },
    },
  });

  assert.equal(target.isAutoSaved, true);
  assert.equal(target.assetId, 'asset-1');
  assert.equal(target.assetOwnerUserId, 'parent-1');
  assert.equal(target.childId, 'child-a');
  assert.equal(target.match.childId, 'child-a');
  assert.equal(target.match.score, 0.94);
  assert.equal(target.match.captureQuality, 0.82);
  assert.equal(target.match.faceCount, 1);
  assert.equal(target.match.creationTime, '2026-07-09T12:00:00.000Z');
});

test('auto-save correction threshold asks for review after the first correction', () => {
  assert.equal(AUTO_SAVE_CORRECTION_REVIEW_THRESHOLD, 1);
  assert.equal(autoSaveCorrectionNeedsReview(0), false);
  assert.equal(autoSaveCorrectionNeedsReview(1), true);
});

test('auto-save correction copy avoids overclaiming model learning', () => {
  const copy = Object.values(AUTO_SAVE_CORRECTION_COPY).join(' ');
  assert.match(copy, /original stays in Photos/i);
  assert.match(copy, /pauses/i);
  assert.doesNotMatch(copy, /teach(?:es)? the model|learns from|confidence|threshold|delete originals/i);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PHOTO_STACK_SESSION_GAP_MS,
  buildReviewStacks,
  defaultKeepCount,
  expandReviewItems,
  selectedAssetIdsForReview,
} from '../../src/photoStackModel.js';

test('a 40-shot photo shoot folds into no more than 4 stacks', () => {
  const matches = Array.from({ length: 40 }, (_, index) => match(index, {
    creationTime: Date.UTC(2026, 6, 5, 12, index),
    featureVector: [1, 0.01 * index],
  }));

  const items = buildReviewStacks(matches);
  const stacks = items.filter((item) => item.type === 'stack');

  assert.ok(stacks.length <= 4);
  assert.equal(stacks.reduce((sum, item) => sum + item.matches.length, 0), 40);
  assert.equal(stacks[0].keep.length, 3);
  assert.equal(stacks[0].folded.length, 37);
});

test('session gap splits stacks after 30 minutes', () => {
  const start = Date.UTC(2026, 6, 5, 12, 0);
  const matches = [
    match(1, { creationTime: start, featureVector: [1, 0] }),
    match(2, { creationTime: start + 10 * 60 * 1000, featureVector: [1, 0.01] }),
    match(3, { creationTime: start + PHOTO_STACK_SESSION_GAP_MS + 31 * 60 * 1000, featureVector: [1, 0] }),
    match(4, { creationTime: start + PHOTO_STACK_SESSION_GAP_MS + 32 * 60 * 1000, featureVector: [1, 0.01] }),
  ];

  const stacks = buildReviewStacks(matches).filter((item) => item.type === 'stack');
  assert.equal(stacks.length, 2);
});

test('stack cover and default keeps are ranked by capture quality', () => {
  const matches = [
    match(1, { captureQuality: 0.4 }),
    match(2, { captureQuality: 0.9 }),
    match(3, { captureQuality: 0.7 }),
  ];

  const [stack] = buildReviewStacks(matches);
  assert.equal(stack.cover.assetId, 'asset-2');
  assert.deepEqual(stack.keep.map((item) => item.assetId), ['asset-2']);
});

test('parent-pinned photos are never demoted by sharper siblings', () => {
  const matches = [
    match(1, { captureQuality: 0.1, pinned: true }),
    match(2, { captureQuality: 0.95 }),
    match(3, { captureQuality: 0.7 }),
  ];

  const [stack] = buildReviewStacks(matches);

  assert.equal(stack.cover.assetId, 'asset-1');
  assert.deepEqual(stack.keep.map((item) => item.assetId), ['asset-1']);
  assert.equal(stack.pinnedCount, 1);
  assert.equal(stack.curationSummary, 'Kept parent pick · 1 of 3');
  assert.deepEqual(stack.folded.map((item) => item.assetId), ['asset-2', 'asset-3']);
});

test('below-floor siblings fold out of default saves but remain expandable', () => {
  const matches = [
    match(1, { captureQuality: 0.2, score: 0.99 }),
    match(2, { captureQuality: 0.8, score: 0.91 }),
  ];

  const reviewItems = buildReviewStacks(matches);
  const [stack] = reviewItems;
  const expanded = expandReviewItems(reviewItems, new Set([stack.id]));
  const foldedFrame = expanded.find((item) => item.match?.assetId === 'asset-1');

  assert.equal(stack.cover.assetId, 'asset-2');
  assert.deepEqual(stack.keep.map((item) => item.assetId), ['asset-2']);
  assert.deepEqual(stack.folded.map((item) => item.assetId), ['asset-1']);
  assert.equal(foldedFrame?.folded, true);
  assert.equal(selectedAssetIdsForReview({ matches, reviewItems }).has('asset-1'), false);
  assert.equal(
    selectedAssetIdsForReview({ matches, reviewItems, promotedFoldedIds: new Set(['asset-1']) }).has('asset-1'),
    true,
  );
});

test('expanded stack includes every frame and folded promotion selects that asset', () => {
  const matches = Array.from({ length: 12 }, (_, index) => match(index, {
    captureQuality: index / 20,
  }));
  const reviewItems = buildReviewStacks(matches);
  const stack = reviewItems[0];
  const expanded = expandReviewItems(reviewItems, new Set([stack.id]));
  const frameItems = expanded.filter((item) => item.type === 'match');
  const foldedAsset = stack.folded[0].assetId;

  assert.equal(frameItems.length, 12);
  assert.equal(selectedAssetIdsForReview({ matches, reviewItems }).has(foldedAsset), false);
  assert.equal(
    selectedAssetIdsForReview({ matches, reviewItems, promotedFoldedIds: new Set([foldedAsset]) }).has(foldedAsset),
    true,
  );
});

test('default keep count is top 1 plus one per 10, capped at 3', () => {
  assert.equal(defaultKeepCount(9), 1);
  assert.equal(defaultKeepCount(10), 2);
  assert.equal(defaultKeepCount(20), 3);
  assert.equal(defaultKeepCount(40), 3);
});

function match(index, patch = {}) {
  return {
    assetId: `asset-${index}`,
    mediaType: 'image',
    score: 0.9,
    captureQuality: 0.5,
    faceSizeRatio: 0.4,
    sharpness: 500,
    creationTime: Date.UTC(2026, 6, 5, 12, 0) + index * 1000,
    uri: `file:///asset-${index}.jpg`,
    accepted: true,
    saved: false,
    featureVector: [1, 0],
    ...patch,
  };
}

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PHOTO_STACK_SESSION_GAP_MS,
  assetIdsForReviewAction,
  buildReviewStacks,
  defaultKeepCount,
  expandReviewItems,
  selectedAssetIdsForReview,
} from '../../src/photoStackModel.js';

test('a 40-shot lookalike photo shoot folds to one best frame', () => {
  const matches = Array.from({ length: 40 }, (_, index) => match(index, {
    creationTime: Date.UTC(2026, 6, 5, 12, index),
    visualFingerprint: [1, 0.01 * index],
  }));

  const items = buildReviewStacks(matches);
  const stacks = items.filter((item) => item.type === 'stack');

  assert.ok(stacks.length <= 4);
  assert.equal(stacks.reduce((sum, item) => sum + item.matches.length, 0), 40);
  assert.equal(stacks[0].keep.length, 1);
  assert.equal(stacks[0].folded.length, 39);
});

test('session gap splits stacks after 30 minutes', () => {
  const start = Date.UTC(2026, 6, 5, 12, 0);
  const matches = [
    match(1, { creationTime: start, visualFingerprint: [1, 0] }),
    match(2, { creationTime: start + 10 * 60 * 1000, visualFingerprint: [1, 0.01] }),
    match(3, { creationTime: start + PHOTO_STACK_SESSION_GAP_MS + 31 * 60 * 1000, visualFingerprint: [1, 0] }),
    match(4, { creationTime: start + PHOTO_STACK_SESSION_GAP_MS + 32 * 60 * 1000, visualFingerprint: [1, 0.01] }),
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
  assert.equal(stack.curationSummary, 'Kept best 1 of 3');
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

test('stack keep and skip actions are reversible before save', () => {
  const matches = [
    match(1, { captureQuality: 0.95 }),
    match(2, { captureQuality: 0.6 }),
    match(3, { captureQuality: 0.4 }),
  ];
  const reviewItems = buildReviewStacks(matches);
  const [stack] = reviewItems;
  const keepIds = assetIdsForReviewAction(stack, 'accept');
  const skipIds = assetIdsForReviewAction(stack, 'reject');

  assert.deepEqual(keepIds, ['asset-1']);
  assert.deepEqual(skipIds, ['asset-1', 'asset-2', 'asset-3']);
  assert.equal(selectedAssetIdsForReview({ matches, reviewItems, rejectedIds: new Set(skipIds) }).size, 0);
  assert.deepEqual(
    [...selectedAssetIdsForReview({
      matches,
      reviewItems,
      rejectedIds: new Set(skipIds.filter((id) => !keepIds.includes(id))),
    })],
    keepIds,
  );
});

test('default keep count is one best frame for every lookalike stack', () => {
  assert.equal(defaultKeepCount(9), 1);
  assert.equal(defaultKeepCount(10), 1);
  assert.equal(defaultKeepCount(20), 1);
  assert.equal(defaultKeepCount(40), 1);
});

test('missing visual fingerprints only fold true rapid bursts', () => {
  const start = Date.UTC(2026, 6, 5, 12, 0);
  const matches = [
    match(1, { creationTime: start, visualFingerprint: null, captureQuality: 0.7 }),
    match(2, { creationTime: start + 1000, visualFingerprint: null, captureQuality: 0.9 }),
    match(3, { creationTime: start + 5 * 60 * 1000, visualFingerprint: null, captureQuality: 0.8 }),
  ];

  const items = buildReviewStacks(matches);
  assert.equal(items.length, 2);
  assert.equal(items.find((item) => item.type === 'stack')?.cover.assetId, 'asset-2');
});

test('whole-image fingerprints keep different photos even when face identity vectors match', () => {
  const start = Date.UTC(2026, 6, 5, 12, 0);
  const matches = [
    match(1, {
      creationTime: start,
      featureVector: [1, 0],
      visualFingerprint: [1, 1, 1, 1],
    }),
    match(2, {
      creationTime: start + 1000,
      featureVector: [1, 0],
      visualFingerprint: [1, -1, 1, -1],
    }),
  ];

  const items = buildReviewStacks(matches);
  assert.equal(items.length, 2);
  assert.ok(items.every((item) => item.type === 'match'));
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
    visualFingerprint: [1, 0],
    ...patch,
  };
}

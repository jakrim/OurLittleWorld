import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTonightModel } from '../../src/tonightModel.js';

const promptState = {
  prompt: { text: 'What tiny thing should we remember from today?' },
  mine: null,
  snoozed: false,
};

const firstSuggestion = {
  goalKey: 'smile',
  title: 'Possible first smile',
  alternates: [{ assetId: 'a' }, { assetId: 'b' }],
};

const digest = {
  headline: 'A week of small laughs',
  momentCount: 4,
  milestoneCount: 1,
  voiceNoteCount: 0,
  letterCount: 0,
};

test('tonight model ranks up to three evening items from available sources', () => {
  const model = buildTonightModel({
    promptState,
    pendingReviewCount: 5,
    recentPhotos: [{ thumbUrl: 'one.jpg' }, { thumbUrl: 'two.jpg' }, { thumbUrl: 'three.jpg' }],
    firstSuggestion,
    digest,
    digestUnread: true,
  });

  assert.equal(model.visible, true);
  assert.equal(model.items.length, 3);
  assert.deepEqual(model.items.map((item) => item.kind), ['prompt', 'review', 'suggested-first']);
  assert.equal(model.items[0].route, '/prompt');
  assert.match(model.items[1].title, /5 likely photos/);
  assert.match(model.items[2].title, /may belong with Firsts/);
});

test('tonight model suppresses items already owned by the primary Today card', () => {
  const model = buildTonightModel({
    promptState,
    pendingReviewCount: 3,
    firstSuggestion,
    digest,
    digestUnread: true,
    suppressedKinds: ['prompt', 'review'],
  });

  assert.deepEqual(model.items.map((item) => item.kind), ['suggested-first', 'digest']);
});

test('brand-new families do not get an empty tonight section', () => {
  const model = buildTonightModel();

  assert.equal(model.visible, false);
  assert.deepEqual(model.items, []);
});

test('answered or snoozed prompts are not shown again tonight', () => {
  assert.equal(buildTonightModel({
    promptState: { ...promptState, mineAnswered: true },
  }).visible, false);

  assert.equal(buildTonightModel({
    promptState: { ...promptState, snoozed: true },
  }).visible, false);
});

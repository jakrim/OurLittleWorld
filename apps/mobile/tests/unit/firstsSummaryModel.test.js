import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFirstsSummary } from '../../src/firstsSummaryModel.js';

test('firsts summary ignores unfinished placeholders and attaches the latest completed photo', () => {
  const summary = buildFirstsSummary([
    {
      id: 'goal:smile',
      title: 'First smile',
      done: false,
      asset_owner_user_id: 'parent-1',
      asset_id: 'placeholder-photo',
    },
    {
      id: 'first-word',
      title: 'First word',
      done: true,
      asset_owner_user_id: 'parent-1',
      asset_id: 'word-photo',
    },
    {
      id: 'first-food',
      title: 'First food',
      asset_owner_user_id: 'parent-1',
      asset_id: 'food-photo',
    },
  ], [
    { asset_owner_user_id: 'parent-1', asset_id: 'placeholder-photo', thumbUrl: 'placeholder.jpg' },
    { asset_owner_user_id: 'parent-1', asset_id: 'word-photo', thumbUrl: 'word.jpg' },
  ]);

  assert.equal(summary.count, 2);
  assert.equal(summary.latest.title, 'First word');
  assert.equal(summary.latestPhoto.thumbUrl, 'word.jpg');
});

test('firsts summary returns no teaser row when every first is unfinished', () => {
  const summary = buildFirstsSummary([
    { id: 'goal:roll', title: 'First roll', done: false },
  ]);

  assert.equal(summary.count, 0);
  assert.equal(summary.latest, null);
  assert.equal(summary.latestPhoto, null);
});

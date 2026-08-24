import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBookCollectionSummaries,
  buildLettersSummary,
  letterOpenState,
} from '../../src/bookCollectionsModel.js';

test('book collection summary reuses completed firsts and latest attached photo', () => {
  const summary = buildBookCollectionSummaries({
    childId: 'child-a',
    firsts: [
      { id: 'goal:smile', title: 'First smile', done: false },
      {
        id: 'first-word',
        title: 'First word',
        done: true,
        child_id: 'child-a',
        asset_owner_user_id: 'parent-1',
        asset_id: 'word-photo',
      },
      {
        id: 'other-child-word',
        title: 'Other child first word',
        done: true,
        child_id: 'child-b',
        asset_owner_user_id: 'parent-1',
        asset_id: 'other-word-photo',
      },
    ],
    sharedPhotos: [
      { asset_owner_user_id: 'parent-1', asset_id: 'word-photo', thumbUrl: 'word.jpg', child_id: 'child-a' },
      { asset_owner_user_id: 'parent-1', asset_id: 'other-word-photo', thumbUrl: 'other.jpg', child_id: 'child-b' },
    ],
  });

  assert.equal(summary.childId, 'child-a');
  assert.equal(summary.childScoped, true);
  assert.equal(summary.firsts.count, 1);
  assert.equal(summary.firsts.latest.title, 'First word');
  assert.equal(summary.firsts.latestPhoto.thumbUrl, 'word.jpg');
});

test('book collection summary can scope letters by active child', () => {
  const summary = buildBookCollectionSummaries({
    childId: 'child-a',
    letters: [
      { id: 'letter-a', title: 'For A', child_id: 'child-a', created_at: '2026-07-01T12:00:00Z' },
      { id: 'letter-b', title: 'For B', child_id: 'child-b', created_at: '2026-07-02T12:00:00Z' },
      { id: 'legacy-letter', title: 'Legacy', created_at: '2026-06-01T12:00:00Z' },
    ],
    now: new Date('2026-07-09T12:00:00'),
  });

  assert.equal(summary.letters.count, 2);
  assert.equal(summary.letters.latest.title, 'For A');
});

test('letters summary counts open letters with or without open dates and picks latest created letter', () => {
  const summary = buildLettersSummary([
    {
      id: 'open-default',
      title: 'Open by default',
      created_at: '2026-01-02T12:00:00Z',
      open_on: null,
    },
    {
      id: 'open-note',
      title: 'Open note',
      created_at: '2026-01-01T12:00:00Z',
      open_on: '2026-01-01',
    },
    {
      id: 'sealed-note',
      title: 'Sealed note',
      created_at: '2026-07-01T12:00:00Z',
      open_on: '2030-01-01',
    },
  ], new Date('2026-07-09T12:00:00'));

  assert.equal(summary.count, 3);
  assert.equal(summary.openCount, 2);
  assert.equal(summary.sealedCount, 1);
  assert.equal(summary.latest.title, 'Sealed note');
  assert.equal(summary.latestState, 'sealed');
});

test('letter open state treats date-only open dates as local calendar days', () => {
  assert.equal(
    letterOpenState({ open_on: '2026-07-09' }, new Date('2026-07-09T08:00:00')),
    'open',
  );
  assert.equal(
    letterOpenState({ open_on: '2026-07-10' }, new Date('2026-07-09T23:59:00')),
    'sealed',
  );
  assert.equal(letterOpenState({ open_on: null }, new Date('2026-07-09T12:00:00')), 'open');
});

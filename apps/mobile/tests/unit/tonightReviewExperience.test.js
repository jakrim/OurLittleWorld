import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTodayManualQaFixture, todayManualQaRouteParams } from '../../src/todayManualQaFixtures.js';
import {
  TONIGHT_MEDIA_COLLAPSE_DISTANCE,
  TONIGHT_REVIEW_COPY,
  tonightMediaHeights,
} from '../../src/tonightReviewLayoutModel.js';

test('Tonight media gives parent controls more room across device heights', () => {
  assert.equal(TONIGHT_MEDIA_COLLAPSE_DISTANCE, 140);
  assert.deepEqual(tonightMediaHeights(667), { expanded: 347, collapsed: 170 });
  assert.deepEqual(tonightMediaHeights(844), { expanded: 439, collapsed: 186 });
  assert.deepEqual(tonightMediaHeights(1366), { expanded: 520, collapsed: 240 });
});

test('Tonight copy keeps parent decisions and retry state explicit', () => {
  assert.deepEqual(TONIGHT_REVIEW_COPY, {
    noteLabel: 'Add a note (optional)',
    collectionCaption: 'Selected collections are added when you Keep.',
    anotherLabel: 'Another',
    retryKeep: 'This memory didn’t finish saving. Retry Keep before moving on.',
  });
});

test('photo-first QA remains synthetic, local, and stable across Today navigation', () => {
  const fixture = buildTodayManualQaFixture('photo-first');
  assert.equal(fixture.session.status, 'active');
  assert.equal(fixture.session.items.length, 4);
  assert.ok(fixture.session.items.every((item) => item.localUri.startsWith('data:image/svg+xml')));
  assert.deepEqual(todayManualQaRouteParams(fixture), { source: 'today', qa: 'photo-first' });
  assert.deepEqual(todayManualQaRouteParams(null), { source: 'today' });
});

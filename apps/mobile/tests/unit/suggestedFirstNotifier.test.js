import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isWithinQuietHours,
  markSuggestedFirstNotified,
  shouldNotifySuggestedFirst,
  suggestedFirstNotificationCopy,
} from '../../src/suggestedFirstNotifierModel.js';

const suggestion = {
  id: 'first-suggestion:smile:asset-1',
  title: 'Possible first smile',
  alternates: [{ assetId: 'a' }, { assetId: 'b' }],
};

const middayNoQuiet = new Date(2026, 6, 6, 13, 0);

test('copy spells the count, hyphenates the milestone, keeps "possible"', () => {
  assert.deepEqual(suggestedFirstNotificationCopy(suggestion), {
    title: 'Worth a look',
    body: 'Three possible first-smile photos are ready to review.',
  });
  assert.deepEqual(
    suggestedFirstNotificationCopy({ ...suggestion, alternates: [] }),
    { title: 'Worth a look', body: 'One possible first-smile photo is ready to review.' },
  );
  assert.equal(suggestedFirstNotificationCopy({ title: '' }), null);
});

test('quiet hours wrap past midnight', () => {
  assert.equal(isWithinQuietHours(new Date(2026, 6, 6, 22, 0), '21:00', '08:00'), true);
  assert.equal(isWithinQuietHours(new Date(2026, 6, 6, 3, 0), '21:00', '08:00'), true);
  assert.equal(isWithinQuietHours(new Date(2026, 6, 6, 13, 0), '21:00', '08:00'), false);
  assert.equal(isWithinQuietHours(new Date(2026, 6, 6, 8, 0), '21:00', '08:00'), false);
});

test('gate fires once per suggestion, outside quiet hours, when category is on', () => {
  assert.equal(shouldNotifySuggestedFirst({ suggestion, now: middayNoQuiet }), true);

  // explicit category-off suppresses; default-on (undefined) still fires
  assert.equal(shouldNotifySuggestedFirst({
    suggestion,
    preferences: { categories: { suggested_firsts: false } },
    now: middayNoQuiet,
  }), false);
  assert.equal(shouldNotifySuggestedFirst({
    suggestion,
    preferences: { categories: {} },
    now: middayNoQuiet,
  }), true);

  // quiet hours suppress
  assert.equal(shouldNotifySuggestedFirst({ suggestion, now: new Date(2026, 6, 6, 22, 30) }), false);

  // already notified suppresses
  const state = markSuggestedFirstNotified(null, suggestion.id, middayNoQuiet);
  assert.equal(shouldNotifySuggestedFirst({ suggestion, state, now: middayNoQuiet }), false);
});

test('notifier state round-trips and tolerates junk', () => {
  const state = markSuggestedFirstNotified({ notifiedIds: 'junk' }, 'id-1');
  assert.ok(state.notifiedIds['id-1']);
  assert.equal(shouldNotifySuggestedFirst({ suggestion: { id: null }, now: middayNoQuiet }), false);
});

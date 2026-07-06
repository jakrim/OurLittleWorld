import assert from 'node:assert/strict';
import { test } from 'node:test';

import { selectDayCardNudge } from '../../src/dayCardNudge.js';

const catchupGoal = { key: 'laugh', title: 'First laugh', targetAgeLabel: '3-4 months' };
const unansweredPrompt = { prompt: { text: 'What made them smile today?' }, mineAnswered: false, snoozed: false };
const firstSuggestion = {
  goalKey: 'smile',
  title: 'Possible first smile',
  alternates: [{ assetId: 'a' }, { assetId: 'b' }],
};

test('priority order: review > suggested-first > catchup > prompt > digest > fallback', () => {
  const everything = {
    waitingReviewCount: 12,
    firstSuggestion,
    catchupGoal,
    promptState: unansweredPrompt,
    digestUnread: true,
    babyName: 'Reuben',
  };
  assert.equal(selectDayCardNudge(everything).kind, 'review');
  assert.equal(selectDayCardNudge({ ...everything, waitingReviewCount: 0 }).kind, 'suggested-first');
  assert.equal(selectDayCardNudge({ ...everything, waitingReviewCount: 0, firstSuggestion: null }).kind, 'catchup');
  assert.equal(
    selectDayCardNudge({ ...everything, waitingReviewCount: 0, firstSuggestion: null, catchupGoal: null }).kind,
    'prompt',
  );
  assert.equal(
    selectDayCardNudge({
      ...everything, waitingReviewCount: 0, firstSuggestion: null, catchupGoal: null, promptState: null,
    }).kind,
    'digest',
  );
  assert.equal(selectDayCardNudge({}).kind, 'fallback');
});

test('suggested-first nudge counts photos and routes to Firsts', () => {
  const nudge = selectDayCardNudge({ firstSuggestion });
  assert.equal(nudge.eyebrow, 'Worth a look');
  assert.equal(nudge.title, 'Possible first smile — 3 photos to look at');
  assert.equal(nudge.route, '/firsts');
  assert.equal(nudge.goalKey, 'smile');

  const single = selectDayCardNudge({ firstSuggestion: { ...firstSuggestion, alternates: [] } });
  assert.equal(single.title, 'Possible first smile — 1 photo to look at');
});

test('review nudge counts and pluralizes', () => {
  assert.equal(selectDayCardNudge({ waitingReviewCount: 12 }).title, '12 photos are waiting for a look');
  assert.equal(selectDayCardNudge({ waitingReviewCount: 1 }).title, '1 photo is waiting for a look');
});

test('catchup nudge names the child and seeds the composer route', () => {
  const nudge = selectDayCardNudge({ catchupGoal, babyName: 'Reuben' });
  assert.equal(nudge.title, "Did we ever save Reuben's first laugh?");
  assert.equal(nudge.goalKey, 'laugh');
  assert.deepEqual(nudge.route.params, { title: 'First laugh', targetAge: '3-4 months', goalKey: 'laugh' });
});

test('answered or snoozed prompt does not nudge', () => {
  assert.equal(selectDayCardNudge({ promptState: { ...unansweredPrompt, mineAnswered: true } }).kind, 'fallback');
  assert.equal(selectDayCardNudge({ promptState: { ...unansweredPrompt, snoozed: true } }).kind, 'fallback');
  assert.equal(selectDayCardNudge({ promptState: unansweredPrompt }).kind, 'prompt');
});

test('fallback is never empty', () => {
  const nudge = selectDayCardNudge({});
  assert.ok(nudge.title.length > 0);
  assert.equal(nudge.route, null);
});

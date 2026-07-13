import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildBlockingAssistantIssue, selectDayCardNudge } from '../../src/dayCardNudge.js';

const catchupGoal = { key: 'laugh', title: 'First laugh', targetAgeLabel: '3-4 months' };
const unansweredPrompt = { prompt: { text: 'What made them smile today?' }, mineAnswered: false, snoozed: false };
const missedPrompt = {
  promptDate: '2026-07-07',
  promptText: 'What tiny change did you notice?',
};
const firstSuggestion = {
  goalKey: 'smile',
  title: 'Possible first smile',
  alternates: [{ assetId: 'a' }, { assetId: 'b' }],
};
const blockingIssue = {
  kind: 'blocking-repair',
  eyebrow: 'Needs attention',
  title: 'Some memories did not finish saving',
  route: { pathname: '/library', params: { segment: 'photos' } },
};
const bookReadinessNudge = {
  title: 'Add one line to make July easier to remember',
  route: { pathname: '/library', params: { segment: 'photos' } },
};
const photoTrustNudge = {
  kind: 'photo-trust',
  eyebrow: 'Photo assistant',
  title: '5 likely photos are worth a look',
  route: '/review',
};

test('priority order: blocking issue > photo-trust > review > suggested-first > catchup > prompt > missed-prompt > book-readiness > digest > fallback', () => {
  const everything = {
    blockingIssue,
    photoTrustNudge,
    waitingReviewCount: 12,
    firstSuggestion,
    catchupGoal,
    promptState: unansweredPrompt,
    missedPrompt,
    bookReadinessNudge,
    digestUnread: true,
    babyName: 'Reuben',
  };
  assert.equal(selectDayCardNudge(everything).kind, 'blocking-repair');
  assert.equal(selectDayCardNudge({ ...everything, blockingIssue: null }).kind, 'photo-trust');
  assert.equal(selectDayCardNudge({ ...everything, blockingIssue: null, photoTrustNudge: null }).kind, 'review');
  assert.equal(selectDayCardNudge({ ...everything, blockingIssue: null, photoTrustNudge: null, waitingReviewCount: 0 }).kind, 'suggested-first');
  assert.equal(selectDayCardNudge({
    ...everything, blockingIssue: null, photoTrustNudge: null, waitingReviewCount: 0, firstSuggestion: null,
  }).kind, 'catchup');
  assert.equal(
    selectDayCardNudge({
      ...everything, blockingIssue: null, photoTrustNudge: null, waitingReviewCount: 0, firstSuggestion: null, catchupGoal: null,
    }).kind,
    'prompt',
  );
  assert.equal(
    selectDayCardNudge({
      ...everything,
      blockingIssue: null,
      photoTrustNudge: null,
      waitingReviewCount: 0,
      firstSuggestion: null,
      catchupGoal: null,
      promptState: null,
    }).kind,
    'missed-prompt',
  );
  assert.equal(
    selectDayCardNudge({
      ...everything,
      blockingIssue: null,
      photoTrustNudge: null,
      waitingReviewCount: 0,
      firstSuggestion: null,
      catchupGoal: null,
      promptState: null,
      missedPrompt: null,
    }).kind,
    'book-readiness',
  );
  assert.equal(
    selectDayCardNudge({
      ...everything,
      blockingIssue: null,
      photoTrustNudge: null,
      waitingReviewCount: 0,
      firstSuggestion: null,
      catchupGoal: null,
      promptState: null,
      missedPrompt: null,
      bookReadinessNudge: null,
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

test('missed prompt nudge routes to the original prompt date', () => {
  const nudge = selectDayCardNudge({ missedPrompt });

  assert.equal(nudge.kind, 'missed-prompt');
  assert.equal(nudge.eyebrow, 'Worth answering');
  assert.equal(nudge.title, missedPrompt.promptText);
  assert.deepEqual(nudge.route, { pathname: '/prompt', params: { promptDate: '2026-07-07' } });
});

test('fallback is never empty', () => {
  const nudge = selectDayCardNudge({});
  assert.ok(nudge.title.length > 0);
  assert.equal(nudge.route, null);
});

test('blocking assistant issues hide raw repair details behind parent-safe copy', () => {
  const failed = buildBlockingAssistantIssue({
    uploadQueue: { total: 2, failed: 1, uploading: 0, pending: 1, lastError: 'RPC 500 threshold confidence upload exception' },
  });
  assert.equal(failed.kind, 'blocking-repair');
  assert.equal(failed.title, 'Some memories did not finish saving');
  assert.deepEqual(failed.route, { pathname: '/library', params: { segment: 'photos' } });

  const finishing = buildBlockingAssistantIssue({ uploadQueue: { total: 2, failed: 0 } });
  assert.equal(finishing.title, '2 memories are still finishing');

  const iCloud = buildBlockingAssistantIssue({ iCloudWaitingCount: 1 });
  assert.equal(iCloud.kind, 'icloud-wait');
  assert.equal(iCloud.title, '1 photo is waiting for iCloud');

  const scanFailed = buildBlockingAssistantIssue({ scanFailed: true });
  assert.equal(scanFailed.kind, 'scan-repair');
  assert.equal(scanFailed.title, 'Photo scan needs another try');

  for (const nudge of [failed, finishing, iCloud, scanFailed]) {
    assert.doesNotMatch(`${nudge.eyebrow} ${nudge.title}`, /confidence|threshold|queue|rpc|upload exception/i);
  }
});

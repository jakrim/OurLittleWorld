import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  POST_SAVE_NUDGE_MAX_PER_DAY,
  firstSavedLetterNudge,
  markPostSaveNudgeDismissed,
  markPostSaveNudgeShown,
  postSaveNudgeDayKey,
  selectPostSaveNudge,
} from '../../src/postSaveNudgeModel.js';

const goals = [
  {
    key: 'word',
    title: 'First word',
    targetAgeLabel: '9-14 months',
    targetAgeMinDays: 270,
    targetAgeMaxDays: 430,
    sortOrder: 60,
  },
  {
    key: 'steps',
    title: 'First steps',
    targetAgeLabel: '10-18 months',
    targetAgeMinDays: 300,
    targetAgeMaxDays: 560,
    sortOrder: 70,
  },
];

const now = new Date('2026-07-06T15:00:00');
const stepsAgeBirthday = '2025-07-25';
const photoMoment = {
  id: 'moment-1',
  assets: [{ type: 'image', uri: 'file:///photo.jpg' }],
  note: '',
  capturedAt: '2026-07-06T14:00:00.000Z',
};

test('first candidate wins for a photo moment inside an incomplete goal window', () => {
  const nudge = selectPostSaveNudge({
    moment: photoMoment,
    goals,
    firsts: [{ goal_key: 'word', title: 'First word', done: true }],
    birthdayISO: stepsAgeBirthday,
    babyName: 'Reuben',
    now,
  });
  assert.equal(nudge.kind, 'first');
  assert.equal(nudge.question, 'Could this be a First? (first steps · around now)');
  assert.equal(nudge.route.pathname, '/first-compose');
  assert.deepEqual(nudge.route.params, {
    momentId: 'moment-1',
    sourceMomentId: 'moment-1',
    title: 'First steps',
    targetAge: '10-18 months',
    goalKey: 'steps',
    seedDate: '2026-07-06',
  });
});

test('first nudge age logic uses the saved moment date, not the current date', () => {
  const nudge = selectPostSaveNudge({
    moment: { ...photoMoment, id: 'moment-aged' },
    goals: [{
      key: 'crawl',
      title: 'First crawl',
      targetAgeLabel: '7-10 months',
      targetAgeMinDays: 300,
      targetAgeMaxDays: 360,
      sortOrder: 50,
    }],
    firsts: [],
    birthdayISO: stepsAgeBirthday,
    now: new Date('2027-07-06T15:00:00'),
  });
  assert.equal(nudge.kind, 'first');
  assert.equal(nudge.route.params.seedDate, '2026-07-06');
});

test('voice nudge follows when no first window matches', () => {
  const nudge = selectPostSaveNudge({
    moment: { ...photoMoment, id: 'moment-2' },
    goals,
    firsts: [{ goal_key: 'word', done: true }, { goal_key: 'steps', done: true }],
    birthdayISO: stepsAgeBirthday,
    now,
  });
  assert.equal(nudge.kind, 'voice');
  assert.equal(nudge.question, "Add a 20-second voice note while it's fresh?");
});

test('letter nudge follows a voice moment', () => {
  const nudge = selectPostSaveNudge({
    moment: {
      id: 'moment-3',
      voice: { id: 'voice-1' },
      capturedAt: '2026-07-06T14:00:00.000Z',
    },
    goals,
    firsts: [{ goal_key: 'word', done: true }, { goal_key: 'steps', done: true }],
    birthdayISO: stepsAgeBirthday,
    babyName: 'Reuben',
    now,
  });
  assert.equal(nudge.kind, 'letter');
  assert.equal(nudge.route.pathname, '/letter-compose');
  assert.equal(nudge.route.params.sourceMomentId, 'moment-3');
  assert.match(nudge.route.params.body, /Reuben/);
  assert.doesNotMatch(nudge.route.params.body, /becoming|felt|happy|first time/i);
});

test('text-only moment can become a one-line letter with source context', () => {
  const nudge = selectPostSaveNudge({
    moment: {
      id: 'moment-text',
      note: 'One little thing I want you to remember.',
      capturedAt: '2026-07-06T14:00:00.000Z',
    },
    goals,
    firsts: [],
    birthdayISO: stepsAgeBirthday,
    babyName: 'Reuben',
    now,
  });
  assert.equal(nudge.kind, 'letter');
  assert.equal(nudge.route.params.sourceMomentId, 'moment-text');
  assert.equal(nudge.route.params.sourceFirstId, undefined);
});

test('linked-first letter nudges pass source first and moment ids', () => {
  const nudge = selectPostSaveNudge({
    moment: {
      id: 'moment-linked',
      firstId: 'first-1',
      capturedAt: '2026-07-06T14:00:00.000Z',
    },
    goals,
    firsts: [],
    birthdayISO: stepsAgeBirthday,
    now,
  });
  assert.equal(nudge.kind, 'letter');
  assert.equal(nudge.route.params.sourceMomentId, 'moment-linked');
  assert.equal(nudge.route.params.sourceFirstId, 'first-1');
});

test('video-only moment gets a book-ready caption nudge', () => {
  const nudge = selectPostSaveNudge({
    moment: {
      id: 'moment-video',
      assets: [{ type: 'video', uri: 'file:///clip.mov' }],
      capturedAt: '2026-07-06T14:00:00.000Z',
    },
    goals,
    firsts: [{ goal_key: 'word', done: true }, { goal_key: 'steps', done: true }],
    birthdayISO: stepsAgeBirthday,
    now,
  });
  assert.equal(nudge.kind, 'book-ready');
  assert.equal(nudge.question, 'Add one line while this is still fresh?');
  assert.equal(nudge.actionLabel, 'Add one line');
  assert.deepEqual(nudge.route, {
    pathname: '/moment/[momentId]',
    params: {
      momentId: 'moment-video',
      sourceMomentId: 'moment-video',
    },
  });
});

test('dismissed moments never show another post-save nudge', () => {
  const state = markPostSaveNudgeDismissed(null, 'moment-1', now);
  const nudge = selectPostSaveNudge({
    moment: photoMoment,
    goals,
    firsts: [{ goal_key: 'word', done: true }],
    birthdayISO: stepsAgeBirthday,
    state,
    now,
  });
  assert.equal(nudge, null);
});

test('daily cap allows two post-save nudges and blocks the third', () => {
  let state = null;
  state = markPostSaveNudgeShown(state, now);
  assert.equal(selectPostSaveNudge({
    moment: { ...photoMoment, id: 'moment-2' },
    goals,
    firsts: [{ goal_key: 'word', done: true }],
    birthdayISO: stepsAgeBirthday,
    state,
    now,
  }).kind, 'first');
  state = markPostSaveNudgeShown(state, now);
  assert.equal(state.dailyCounts[postSaveNudgeDayKey(now)], POST_SAVE_NUDGE_MAX_PER_DAY);
  assert.equal(selectPostSaveNudge({
    moment: { ...photoMoment, id: 'moment-3' },
    goals,
    firsts: [{ goal_key: 'word', done: true }],
    birthdayISO: stepsAgeBirthday,
    state,
    now,
  }), null);
});

test('X1: first-saved letter nudge is seeded from facts about the archive only', () => {
  const nudge = firstSavedLetterNudge({
    first: {
      id: 'first-1',
      title: 'First smile',
      happened_at: '2025-10-01T12:00:00.000Z',
      moment_id: 'moment-1',
    },
    birthdayISO: '2025-07-23',
  });
  assert.equal(nudge.kind, 'letter');
  assert.equal(nudge.momentId, 'first:first-1');
  assert.equal(nudge.route.params.title, 'About your first smile');
  assert.equal(nudge.route.params.sourceMomentId, 'moment-1');
  assert.equal(nudge.route.params.sourceFirstId, 'first-1');
  // Fact about the archive ("we saved your first smile"), never a claim about
  // the world ("you smiled for the first time").
  assert.match(nudge.route.params.body, /^On October 1, 2025, at 2 months old, we saved your first smile\.\n\n$/);
});

test('X1: first-saved letter nudge falls back gracefully without date or birthday', () => {
  const nudge = firstSavedLetterNudge({ first: { id: 'first-2', title: 'First laugh' } });
  assert.equal(nudge.route.params.body, 'In the family archive, we saved your first laugh.\n\n');
  assert.equal(firstSavedLetterNudge({ first: null }), null);
  assert.equal(firstSavedLetterNudge({ first: { title: '' } }), null);
});

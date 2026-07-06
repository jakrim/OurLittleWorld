import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CATCHUP_DISMISS_DAYS,
  ageInDaysOn,
  buildFirstsModel,
  goalTimingCaption,
  goalWindowState,
  selectCatchupGoal,
} from '../../src/firstsModel.js';

const GOALS = [
  { key: 'smile', title: 'First smile', targetAgeLabel: '6-8 weeks', targetAgeMinDays: 42, targetAgeMaxDays: 70, sortOrder: 10 },
  { key: 'laugh', title: 'First laugh', targetAgeLabel: '3-4 months', targetAgeMinDays: 90, targetAgeMaxDays: 135, sortOrder: 20 },
  { key: 'roll', title: 'First roll', targetAgeLabel: '4-6 months', targetAgeMinDays: 120, targetAgeMaxDays: 195, sortOrder: 30 },
  { key: 'food', title: 'First solid food', targetAgeLabel: '6 months', targetAgeMinDays: 165, targetAgeMaxDays: 240, sortOrder: 40 },
  { key: 'crawl', title: 'First crawl', targetAgeLabel: '7-10 months', targetAgeMinDays: 210, targetAgeMaxDays: 320, sortOrder: 50 },
  { key: 'word', title: 'First word', targetAgeLabel: '9-14 months', targetAgeMinDays: 270, targetAgeMaxDays: 430, sortOrder: 60 },
  { key: 'steps', title: 'First steps', targetAgeLabel: '10-18 months', targetAgeMinDays: 300, targetAgeMaxDays: 560, sortOrder: 70 },
];

test('ageInDaysOn counts local-midnight days', () => {
  assert.equal(ageInDaysOn('2025-08-01', new Date(2025, 7, 1, 15, 30)), 0);
  assert.equal(ageInDaysOn('2025-08-01', new Date(2026, 6, 5)), 338);
  assert.equal(ageInDaysOn(null), null);
  assert.equal(ageInDaysOn('not-a-date'), null);
});

test('11-month-old with zero firsts: next is First word, never First smile', () => {
  const ageDays = 11 * 30 + 13; // ~343
  const { goalProgress } = buildFirstsModel([], GOALS, ageDays);
  assert.equal(goalProgress.next.key, 'word');
  assert.equal(goalProgress.state, 'ahead');
  assert.deepEqual(goalProgress.upcomingTitles, ['First word', 'First steps']);
});

test('newborn with zero firsts: next is First smile', () => {
  const { goalProgress } = buildFirstsModel([], GOALS, 10);
  assert.equal(goalProgress.next.key, 'smile');
});

test('completed goals are skipped when ranking next', () => {
  const rows = [{ id: '1', goal_key: 'word', title: 'First word', done: true }];
  const { goalProgress } = buildFirstsModel(rows, GOALS, 343);
  assert.equal(goalProgress.next.key, 'steps');
});

test('all windows passed: next is null and state is catchup', () => {
  const { goalProgress } = buildFirstsModel([], GOALS, 600);
  assert.equal(goalProgress.next, null);
  assert.equal(goalProgress.state, 'catchup');
});

test('all goals complete: state is complete', () => {
  const rows = GOALS.map((goal, i) => ({ id: String(i), goal_key: goal.key, title: goal.title, done: true }));
  const { goalProgress } = buildFirstsModel(rows, GOALS, 343);
  assert.equal(goalProgress.state, 'complete');
  assert.equal(goalProgress.next, null);
});

test('no birthday: falls back to first incomplete goal', () => {
  const { goalProgress } = buildFirstsModel([], GOALS, null);
  assert.equal(goalProgress.next.key, 'smile');
});

test('goal window states and captions for an 11-month-old', () => {
  const ageDays = 343;
  const smile = { target_age_label: '6-8 weeks', target_age_min_days: 42, target_age_max_days: 70 };
  const word = { target_age_label: '9-14 months', target_age_min_days: 270, target_age_max_days: 430 };
  const noWindow = { target_age_label: '6-8 weeks', target_age_min_days: null, target_age_max_days: null };
  assert.equal(goalWindowState(smile, ageDays), 'past');
  assert.equal(goalWindowState(word, ageDays), 'now');
  assert.equal(goalWindowState(word, 100), 'future');
  assert.equal(goalWindowState(noWindow, ageDays), null);
  assert.equal(goalTimingCaption(smile, ageDays), 'From around 6-8 weeks — add it whenever you remember it');
  assert.equal(goalTimingCaption(word, ageDays), 'Happening around now');
  assert.equal(goalTimingCaption(word, 100), 'Suggested around 9-14 months');
  assert.equal(goalTimingCaption({ target_age_label: null }, null), 'Suggested around someday');
  // no "someday · <window label>" framing anywhere for a past-window goal
  assert.ok(!goalTimingCaption(smile, ageDays).includes('someday'));
});

test('selectCatchupGoal picks oldest past window and honors dismissals', () => {
  const now = new Date(2026, 6, 5);
  const { goalProgress } = buildFirstsModel([], GOALS, 343);
  const first = selectCatchupGoal(goalProgress.goals, 343, {}, now);
  assert.equal(first.key, 'smile');
  const dismissedRecently = { smile: now.getTime() - 1000 };
  assert.equal(selectCatchupGoal(goalProgress.goals, 343, dismissedRecently, now).key, 'laugh');
  const dismissedLongAgo = { smile: now.getTime() - (CATCHUP_DISMISS_DAYS + 1) * 86400000 };
  assert.equal(selectCatchupGoal(goalProgress.goals, 343, dismissedLongAgo, now).key, 'smile');
  // saving the first retires it
  const rows = [{ id: '1', goal_key: 'smile', title: 'First smile', done: true }];
  const saved = buildFirstsModel(rows, GOALS, 343);
  assert.equal(selectCatchupGoal(saved.goalProgress.goals, 343, {}, now).key, 'laugh');
  // unknown age → never nudge
  assert.equal(selectCatchupGoal(goalProgress.goals, null, {}, now), null);
});

test('completion matches by title when goal_key missing', () => {
  const rows = [{ id: '1', title: 'First word!', done: true }];
  const { goalProgress, displayRows } = buildFirstsModel(rows, GOALS, 343);
  assert.equal(goalProgress.next.key, 'steps');
  assert.ok(!displayRows.some((row) => row.id === 'goal:word'));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ageInDaysOn, buildFirstsModel } from '../../src/firstsModel.js';

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

test('completion matches by title when goal_key missing', () => {
  const rows = [{ id: '1', title: 'First word!', done: true }];
  const { goalProgress, displayRows } = buildFirstsModel(rows, GOALS, 343);
  assert.equal(goalProgress.next.key, 'steps');
  assert.ok(!displayRows.some((row) => row.id === 'goal:word'));
});

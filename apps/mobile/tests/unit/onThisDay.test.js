import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  annualTodayMatches,
  isUnderTwo,
  monthversaryBuckets,
  monthversaryLabel,
} from '../../src/onThisDay.js';

test('monthversary buckets land on the same day-of-month, ±1 day window', () => {
  const now = new Date(2026, 6, 5); // July 5, 2026
  const buckets = monthversaryBuckets({ now });
  assert.deepEqual(buckets.map((b) => b.monthsAgo), [1, 2, 3, 6]);
  const one = buckets[0];
  assert.equal(one.target.getMonth(), 5); // June
  assert.equal(one.target.getDate(), 5);
  assert.equal(one.start.getDate(), 4);
  assert.equal(one.end.getDate(), 7); // exclusive end = target + 2
});

test('the 29th-31st clamp to the last day of shorter months', () => {
  const now = new Date(2026, 2, 31); // March 31, 2026
  const buckets = monthversaryBuckets({ now, months: [1] });
  assert.equal(buckets[0].target.getMonth(), 1); // February
  assert.equal(buckets[0].target.getDate(), 28); // 2026 not a leap year
});

test('buckets before the birthday are dropped', () => {
  const now = new Date(2026, 6, 5);
  const buckets = monthversaryBuckets({ now, birthdayISO: '2026-05-01' });
  assert.deepEqual(buckets.map((b) => b.monthsAgo), [1, 2]);
});

test('annualTodayMatches only returns prior-year exact-date photos', () => {
  const now = new Date(2026, 6, 5);
  const shared = [
    { asset_id: 'a', creation_time: new Date(2025, 6, 5, 10).toISOString() }, // prior year, same date
    { asset_id: 'b', creation_time: new Date(2026, 6, 5, 9).toISOString() },  // today — excluded
    { asset_id: 'c', creation_time: new Date(2025, 6, 6).toISOString() },     // wrong day
  ];
  const matches = annualTodayMatches(shared, now);
  assert.deepEqual(matches.map((p) => p.asset_id), ['a']);
});

test('monthversary labels read naturally', () => {
  assert.equal(monthversaryLabel('River', 1), 'River, one month ago today');
  assert.equal(monthversaryLabel('River', 6), 'River, six months ago today');
  assert.equal(monthversaryLabel(null, 2), 'Two months ago today');
});

test('isUnderTwo gates the month-versary fallback', () => {
  assert.equal(isUnderTwo(343), true);
  assert.equal(isUnderTwo(730), false);
  assert.equal(isUnderTwo(null), false);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ageAt,
  formatAge,
  localCalendarDayDiff,
  localDateFromISODate,
} from '../../src/ageModel.js';

test('birthday ISO dates parse at local midnight', () => {
  const date = localDateFromISODate('2025-08-01');

  assert.equal(date.getFullYear(), 2025);
  assert.equal(date.getMonth(), 7);
  assert.equal(date.getDate(), 1);
  assert.equal(date.getHours(), 0);
  assert.equal(localDateFromISODate('not-a-date'), null);
});

test('ageAt totalDays matches the Today day counter calendar math', () => {
  const birthday = '2025-07-23';
  const now = new Date(2026, 6, 5, 15, 30);
  const age = ageAt(birthday, now.getTime());
  const dayCount = localCalendarDayDiff(localDateFromISODate(birthday), now);

  assert.equal(age.totalDays, dayCount);
  assert.equal(dayCount, 347);
  assert.equal(formatAge(age), '11 months, 12 days');
});

test('formatAge spells out mixed month and year units', () => {
  assert.equal(formatAge({ years: 0, months: 11, days: 13, totalDays: 348 }), '11 months, 13 days');
  assert.equal(formatAge({ years: 1, months: 3, days: 2, totalDays: 459 }), '1 year, 3 months');
});

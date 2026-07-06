import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultFirstHappenedDate } from '../../src/firstComposeSeedModel.js';

test('past seeded firsts default to the latest date inside the goal window', () => {
  const date = defaultFirstHappenedDate({
    babyBirthday: '2025-07-23',
    goal: { targetAgeMinDays: 42, targetAgeMaxDays: 70 },
    now: new Date(2026, 6, 5, 15),
  });

  assert.equal(date, '2025-10-01');
});

test('current or future seeded firsts default to today', () => {
  const date = defaultFirstHappenedDate({
    babyBirthday: '2025-07-23',
    goal: { targetAgeMinDays: 270, targetAgeMaxDays: 430 },
    now: new Date(2026, 6, 5, 15),
  });

  assert.equal(date, '2026-07-05');
});

test('seeded firsts without a birthday or goal window stay blank', () => {
  assert.equal(defaultFirstHappenedDate({ babyBirthday: null, goal: { targetAgeMaxDays: 70 } }), '');
  assert.equal(defaultFirstHappenedDate({ babyBirthday: '2025-07-23', goal: null }), '');
});

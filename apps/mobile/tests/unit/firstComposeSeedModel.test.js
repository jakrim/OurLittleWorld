import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  defaultFirstHappenedDate,
  firstHappenedAgeLabel,
  firstHappenedDateCaption,
  firstPhotoHappenedDate,
  firstPhotoSearchWindow,
} from '../../src/firstComposeSeedModel.js';

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

test('first happened age is derived from birthday and happened date', () => {
  assert.equal(firstHappenedAgeLabel({
    babyBirthday: '2025-07-23',
    happenedDate: '2025-10-01',
  }), '2 months, 8 days');

  assert.equal(firstHappenedAgeLabel({
    babyBirthday: '2025-07-23',
    happenedDate: '',
  }), '');
});

test('first happened date caption includes the computed age when available', () => {
  assert.equal(firstHappenedDateCaption({
    babyBirthday: '2025-07-23',
    babyName: 'Reuben',
    happenedDate: '2025-10-01',
  }), "Reuben's age on this date: 2 months, 8 days. Roughly when it happened is fine.");

  assert.equal(firstHappenedDateCaption({
    babyBirthday: null,
    happenedDate: '2025-10-01',
  }), 'Roughly when it happened is fine.');
});

test('attached first photo date is derived from the photo capture time', () => {
  assert.equal(firstPhotoHappenedDate({
    creation_time: new Date(2025, 9, 1, 8, 30).toISOString(),
  }), '2025-10-01');
  assert.equal(firstPhotoHappenedDate({ creation_time: 'not-a-date' }), '');
  assert.equal(firstPhotoHappenedDate(null), '');
});

test('seeded first photo search starts at birth and ends after the first date', () => {
  const window = firstPhotoSearchWindow({
    babyBirthday: '2025-07-23',
    happenedDate: '2025-10-01',
    goal: { targetAgeMaxDays: 70 },
    now: new Date(2026, 6, 5, 15),
  });

  assert.deepEqual(window, {
    capturedOnOrAfter: new Date(2025, 6, 23).toISOString(),
    capturedBefore: new Date(2025, 9, 2).toISOString(),
  });
});

test('seeded first photo search falls back to the goal window and caps future dates', () => {
  const window = firstPhotoSearchWindow({
    babyBirthday: '2026-07-01',
    happenedDate: '',
    goal: { targetAgeMaxDays: 70 },
    now: new Date(2026, 6, 5, 15),
  });

  assert.deepEqual(window, {
    capturedOnOrAfter: new Date(2026, 6, 1).toISOString(),
    capturedBefore: new Date(2026, 6, 6).toISOString(),
  });
  assert.equal(firstPhotoSearchWindow({ babyBirthday: null }), null);
});

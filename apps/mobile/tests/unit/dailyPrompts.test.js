import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PROMPT_AGE_BANDS,
  promptAgeBandForDate,
  promptForDate,
  promptPoolForDate,
} from '../../src/dailyPrompts.js';

function isoDatePlus(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() + days);
  const outYear = value.getFullYear();
  const outMonth = String(value.getMonth() + 1).padStart(2, '0');
  const outDay = String(value.getDate()).padStart(2, '0');
  return `${outYear}-${outMonth}-${outDay}`;
}

test('each age band has at least 14 drafted prompts', () => {
  for (const band of PROMPT_AGE_BANDS) {
    assert.ok(band.prompts.length >= 14, `${band.key} needs at least 14 prompts`);
  }
});

test('daily prompt rotation does not repeat on consecutive days', () => {
  const familyId = 'family-a3';
  const babyBirthday = '2025-09-05';
  let previous = null;
  for (let offset = 0; offset < 120; offset += 1) {
    const date = isoDatePlus('2026-07-01', offset);
    const prompt = promptForDate({ familyId, babyBirthday, date });
    assert.notEqual(prompt.key, previous?.key, `repeated on ${date}`);
    previous = prompt;
  }
});

test('daily prompt rotation avoids repeats across many family seeds and age-band transitions', () => {
  for (let family = 0; family < 30; family += 1) {
    const familyId = `family-a3-${family}`;
    const babyBirthday = isoDatePlus('2025-01-01', family * 3);
    let previous = null;
    for (let offset = 0; offset < 700; offset += 1) {
      const date = isoDatePlus('2025-01-01', offset);
      const prompt = promptForDate({ familyId, babyBirthday, date });
      assert.notEqual(prompt.key, previous?.key, `repeated for ${familyId} on ${date}`);
      previous = prompt;
    }
  }
});

test('daily prompt rotation does not repeat on the birthday boundary', () => {
  const familyId = 'family-a3-birthday-boundary';
  const babyBirthday = '2025-05-19';
  const before = promptForDate({ familyId, babyBirthday, date: '2025-05-18' });
  const birthday = promptForDate({ familyId, babyBirthday, date: '2025-05-19' });
  assert.notEqual(birthday.key, before.key);
});

test('ten-month-old prompt selection uses the 6-12m band, not newborn prompts', () => {
  const date = '2026-07-05';
  const babyBirthday = '2025-09-05';
  const band = promptAgeBandForDate({ babyBirthday, date });
  const prompt = promptForDate({ familyId: 'family-a3', babyBirthday, date });

  assert.equal(band.key, '6-12m');
  assert.equal(prompt.key.startsWith('newborn-'), false);
});

test('same family, birthday, and date deterministically selects the same prompt', () => {
  const args = {
    familyId: 'family-a3',
    babyBirthday: '2025-09-05',
    date: '2026-07-05',
  };

  assert.deepEqual(promptForDate(args), promptForDate(args));
});

test('missing birthday falls back to the shared prompt pool', () => {
  const pool = promptPoolForDate({ date: '2026-07-05' });
  assert.equal(pool.band, null);
  assert.equal(pool.prompts.every((prompt) => prompt.key.startsWith('shared-')), true);
});

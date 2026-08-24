import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  formatMonthiversary,
  monthiversaryDayForFamily,
  normalizeMonthiversaryDay,
} from '../../src/ritualSettingsModel.js';

test('monthiversary day is derived from the baby birthday', () => {
  assert.equal(monthiversaryDayForFamily({ babyBirthday: '2025-07-23' }), 23);
  assert.equal(monthiversaryDayForFamily({ babyBirthday: '' }), null);
});

test('normalizeRitualSettings ignores stored custom monthiversary day when birthday is known', () => {
  const monthiversaryDay = normalizeMonthiversaryDay({
    row: { monthiversary_enabled: true, monthiversary_day: 15 },
    family: { babyBirthday: '2025-07-23' },
  });

  assert.equal(monthiversaryDay, 23);
  assert.equal(formatMonthiversary({ monthiversaryEnabled: true, monthiversaryDay }), '23rd monthly');
});

test('normalizeRitualSettings keeps stored monthiversary day when birthday is unknown', () => {
  const monthiversaryDay = normalizeMonthiversaryDay({
    row: { monthiversary_enabled: true, monthiversary_day: 15 },
    family: { babyBirthday: '' },
  });

  assert.equal(monthiversaryDay, 15);
});

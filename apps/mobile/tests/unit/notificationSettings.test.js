import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  NOTIFICATION_DAILY_HARD_CAP,
  enabledNotificationCount,
  mergeNotificationPreferences,
  normalizeNotificationPreferences,
} from '../../src/notificationSettingsModel.js';

test('notification defaults keep calm hard cap and quiet hours tunable constants', () => {
  const defaults = normalizeNotificationPreferences([]);

  assert.equal(NOTIFICATION_DAILY_HARD_CAP, 2);
  assert.equal(DEFAULT_QUIET_HOURS_START, '21:00');
  assert.equal(DEFAULT_QUIET_HOURS_END, '08:00');
  assert.equal(defaults.categories.partner_activity, true);
  assert.equal(defaults.categories.weekly_digest, true);
  assert.equal(defaults.categories.suggested_firsts, true);
});

test('saved notification rows override only their category and quiet hours', () => {
  const prefs = normalizeNotificationPreferences([
    {
      category: 'partner_activity',
      enabled: false,
      quiet_start: '22:00:00',
      quiet_end: '07:00:00',
    },
  ]);

  assert.equal(prefs.categories.partner_activity, false);
  assert.equal(prefs.categories.weekly_digest, true);
  assert.equal(prefs.quietStart, '22:00');
  assert.equal(prefs.quietEnd, '07:00');
});

test('notification preference patches preserve existing category state', () => {
  const current = normalizeNotificationPreferences([{ category: 'partner_activity', enabled: false }]);
  const next = mergeNotificationPreferences(current, { categories: { daily_prompt: false } });

  assert.equal(next.categories.partner_activity, false);
  assert.equal(next.categories.daily_prompt, false);
  assert.equal(next.categories.weekly_digest, true);
  // 8 categories, 2 disabled (partner_activity + daily_prompt) → 6 enabled.
  assert.equal(enabledNotificationCount(next), 6);
});

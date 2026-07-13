import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAddManualQaFixture,
  buildAddManualQaPostSaveNudge,
  normalizeAddManualQaFixture,
} from '../../src/addManualQaFixtures.js';
import { buildAddMomentState } from '../../src/addMomentModel.js';

test('normalizes only supported Add manual QA fixtures', () => {
  assert.equal(normalizeAddManualQaFixture('photo-only'), 'photo-only');
  assert.equal(normalizeAddManualQaFixture(['photo-only']), 'photo-only');
  assert.equal(normalizeAddManualQaFixture('save-real-data'), null);
  assert.equal(normalizeAddManualQaFixture(undefined), null);
});

test('photo-only Add fixture enables save without context and produces one nudge', () => {
  const fixture = buildAddManualQaFixture('photo-only', {
    now: new Date('2026-07-09T12:00:00Z'),
  });
  const state = buildAddMomentState({ assets: fixture.assets });
  const nudge = buildAddManualQaPostSaveNudge(fixture, {
    family: { babyBirthday: '2025-07-23', babyName: 'Reuben' },
    assets: fixture.assets,
    now: new Date('2026-07-09T12:00:00Z'),
  });

  assert.equal(state.canSave, true);
  assert.equal(state.hasContext, false);
  assert.equal(nudge.kind, 'voice');
  assert.equal(nudge.question, "Add a 20-second voice note while it's fresh?");
  assert.equal(nudge.actionLabel, 'Open moment');
});

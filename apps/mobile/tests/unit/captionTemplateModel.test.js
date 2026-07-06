import assert from 'node:assert/strict';
import { test } from 'node:test';

import { suggestedFirstNote } from '../../src/captionTemplateModel.js';

test('suggested note composes date, age, and scene from real metadata only', () => {
  assert.equal(suggestedFirstNote({
    babyBirthday: '2025-07-23',
    happenedDate: '2025-10-01',
    sceneLabels: ['Midday outing'],
  }), 'Oct 1 — 2 months, 8 days old. Midday outing.');
});

test('suggested note drops missing parts instead of inventing them', () => {
  assert.equal(suggestedFirstNote({
    babyBirthday: '2025-07-23',
    happenedDate: '2025-10-01',
  }), 'Oct 1 — 2 months, 8 days old.');

  assert.equal(suggestedFirstNote({
    happenedDate: '2025-10-01',
    sceneLabels: ['Morning routine'],
  }), 'Oct 1. Morning routine.');

  assert.equal(suggestedFirstNote({ babyBirthday: '2025-07-23' }), '');
  assert.equal(suggestedFirstNote(), '');
});

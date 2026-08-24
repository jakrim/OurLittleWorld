import assert from 'node:assert/strict';
import { test } from 'node:test';

import { factsOnlyContextDraft, suggestedFirstNote } from '../../src/captionTemplateModel.js';

test('suggested note composes only grounded date and age', () => {
  assert.equal(suggestedFirstNote({
    babyBirthday: '2025-07-23',
    happenedDate: '2025-10-01',
  }), 'Oct 1 — 2 months, 8 days old.');
});

test('suggested note drops missing parts instead of inventing them', () => {
  assert.equal(suggestedFirstNote({
    babyBirthday: '2025-07-23',
    happenedDate: '2025-10-01',
  }), 'Oct 1 — 2 months, 8 days old.');

  assert.equal(suggestedFirstNote({
    happenedDate: '2025-10-01',
  }), 'Oct 1.');

  assert.equal(suggestedFirstNote({ babyBirthday: '2025-07-23' }), '');
  assert.equal(suggestedFirstNote(), '');
});

test('facts-only context draft can combine date, age, place, first, prompt, and tags', () => {
  assert.equal(factsOnlyContextDraft({
    babyBirthday: '2025-07-23',
    happenedAt: '2026-02-10T15:30:00.000Z',
    placeLabel: 'At home',
    firstTitle: 'First steps',
    promptText: 'What changed this week?',
    tags: ['Bath', '#grandma', 'bath'],
  }), 'Feb 10 — 6 months, 18 days old. Place: At home. First: First steps. Prompt: What changed this week? Tags: Bath, Grandma.');
});

test('facts-only context draft avoids invented story claims', () => {
  const draft = factsOnlyContextDraft({
    babyBirthday: '2025-07-23',
    happenedDate: '2026-02-10',
    placeLabel: 'Park',
    tags: ['clapping'],
  });

  assert.equal(draft, 'Feb 10 — 6 months, 18 days old. Place: Park. Tags: Clapping.');
  assert.equal(/felt|happy|said|wanted|first ever|finally|loved/i.test(draft), false);
  assert.equal(factsOnlyContextDraft({ placeLabel: 'Library' }), 'Place: Library.');
  assert.equal(factsOnlyContextDraft(), '');
});

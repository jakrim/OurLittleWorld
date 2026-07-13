import assert from 'node:assert/strict';
import { test } from 'node:test';

import { promptForDate } from '../../src/dailyPrompts.js';
import {
  MISSED_PROMPT_CATCHUP_DAYS,
  buildMissedPromptCandidates,
  selectMissedPromptCatchup,
} from '../../src/missedPromptModel.js';

const baseArgs = {
  familyId: 'family-c3',
  babyBirthday: '2025-09-05',
  userId: 'parent-a',
  now: new Date('2026-07-09T12:00:00'),
};

test('missed prompt candidates cover the previous seven local days, newest first', () => {
  const candidates = buildMissedPromptCandidates(baseArgs);

  assert.equal(candidates.length, MISSED_PROMPT_CATCHUP_DAYS);
  assert.equal(candidates[0].promptDate, '2026-07-08');
  assert.equal(candidates.at(-1).promptDate, '2026-07-02');
  assert.equal(candidates.some((candidate) => candidate.promptDate === '2026-07-09'), false);
});

test('answered current-parent prompts are excluded, while partner-only answers remain catch-up candidates', () => {
  const candidates = buildMissedPromptCandidates({
    ...baseArgs,
    responses: [
      {
        author_user_id: 'parent-a',
        prompt_date: '2026-07-08',
        response_text: 'A real answer from me.',
      },
      {
        author_user_id: 'parent-b',
        prompt_date: '2026-07-07',
        response_text: 'A co-parent answer.',
      },
    ],
  });

  assert.equal(candidates.some((candidate) => candidate.promptDate === '2026-07-08'), false);
  const partnerOnly = candidates.find((candidate) => candidate.promptDate === '2026-07-07');
  assert.equal(partnerOnly.partnerAnswered, true);
  assert.equal(partnerOnly.answeredCount, 1);
});

test('prompt metadata is generated from the original prompt date', () => {
  const [candidate] = buildMissedPromptCandidates(baseArgs);
  const expected = promptForDate({
    familyId: baseArgs.familyId,
    babyBirthday: baseArgs.babyBirthday,
    date: candidate.promptDate,
  });

  assert.equal(candidate.promptKey, expected.key);
  assert.equal(candidate.promptText, expected.text);
});

test('Today selector returns one missed prompt at a time', () => {
  const candidates = buildMissedPromptCandidates(baseArgs);
  const selected = selectMissedPromptCatchup(candidates);

  assert.equal(selected.promptDate, '2026-07-08');
  assert.equal(selectMissedPromptCatchup([]), null);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildDigestViewStatusLabel,
  buildPromptAnswerStatusLabel,
} from '../../src/secondParentStateModel.js';

const membersById = {
  parent_a: 'Jess Krim',
  parent_b: 'Lauren Krim',
};

test('prompt status names the co-parent who answered when known', () => {
  const label = buildPromptAnswerStatusLabel({
    userId: 'parent_a',
    membersById,
    promptState: {
      responses: [
        { author_user_id: 'parent_b', response_text: 'A real answer.' },
      ],
    },
  });

  assert.equal(label, "Lauren answered · you haven't yet");
});

test('prompt status names both parents when both answered', () => {
  const label = buildPromptAnswerStatusLabel({
    userId: 'parent_a',
    membersById,
    promptState: {
      mineAnswered: true,
      responses: [
        { author_user_id: 'parent_a', response_text: 'Mine.' },
        { author_user_id: 'parent_b', response_text: 'Theirs.' },
      ],
    },
  });

  assert.equal(label, 'Lauren answered too');
});

test('prompt status avoids inventing a missing co-parent', () => {
  const label = buildPromptAnswerStatusLabel({
    userId: 'parent_a',
    membersById: { parent_a: 'Jess Krim' },
    promptState: {
      mineAnswered: true,
      responses: [
        { author_user_id: 'parent_a', response_text: 'Mine.' },
      ],
    },
  });

  assert.equal(label, 'You answered');
});

test('prompt status can name a known co-parent who has not answered', () => {
  const label = buildPromptAnswerStatusLabel({
    userId: 'parent_a',
    membersById,
    promptState: {
      mineAnswered: true,
      responses: [
        { author_user_id: 'parent_a', response_text: 'Mine.' },
      ],
    },
  });

  assert.equal(label, "You answered · Lauren hasn't yet");
});

test('digest view status stays local-only without server-backed viewer state', () => {
  assert.equal(buildDigestViewStatusLabel({ digestUnread: true }), 'Unread on this device');
  assert.equal(buildDigestViewStatusLabel({ digestUnread: false }), 'Opened on this device');
  assert.equal(
    buildDigestViewStatusLabel({ openedHere: true }),
    'Opened on this device. Family-wide view names are not shown yet.',
  );
});

test('digest view status names viewers only when server-backed state is supplied', () => {
  const label = buildDigestViewStatusLabel({
    hasServerViewState: true,
    viewers: ['parent_a', 'parent_b'],
    membersById,
    userId: 'parent_a',
  });

  assert.equal(label, 'You and Lauren viewed');
});

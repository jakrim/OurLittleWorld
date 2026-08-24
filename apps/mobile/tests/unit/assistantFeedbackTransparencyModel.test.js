import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allAssistantFeedbackTransparency,
  assistantFeedbackTransparency,
  feedbackAffects,
  feedbackDoesNotAffect,
  FEEDBACK_KINDS,
  FEEDBACK_TARGETS,
} from '../../src/assistantFeedbackTransparencyModel.js';

test('each assistant feedback kind affects only its own suggestion lane', () => {
  assert.equal(feedbackAffects(FEEDBACK_KINDS.FACE_MATCH_CORRECTION, FEEDBACK_TARGETS.FACE_MATCH_CORRECTIONS), true);
  assert.equal(feedbackAffects(FEEDBACK_KINDS.FIRST_SUGGESTION_NOT_THIS, FEEDBACK_TARGETS.FIRST_SUGGESTIONS), true);
  assert.equal(feedbackAffects(FEEDBACK_KINDS.PHOTO_STACK_CHOICE, FEEDBACK_TARGETS.PHOTO_STACK_CHOICES), true);
  assert.equal(feedbackAffects(FEEDBACK_KINDS.CAPTION_DRAFT_USE, FEEDBACK_TARGETS.CAPTION_DRAFTS), true);
  assert.equal(feedbackAffects(FEEDBACK_KINDS.BOOK_READINESS_ACTION, FEEDBACK_TARGETS.BOOK_READINESS), true);

  for (const entry of allAssistantFeedbackTransparency()) {
    for (const target of entry.doesNotAffect) {
      assert.equal(
        feedbackAffects(entry.kind, target),
        false,
        `${entry.kind} should not affect ${target}`,
      );
      assert.equal(feedbackDoesNotAffect(entry.kind, target), true);
    }
  }
});

test('first suggestion not-this is scoped to First suggestions, not child identity or face matching', () => {
  const entry = assistantFeedbackTransparency(FEEDBACK_KINDS.FIRST_SUGGESTION_NOT_THIS);

  assert.equal(entry.scope, 'device_family_user_first_suggestions');
  assert.match(entry.footer, /Nothing is saved until you keep it/);
  assert.match(entry.footer, /only quiets First suggestions on this device/);
  assert.equal(feedbackDoesNotAffect(entry.kind, FEEDBACK_TARGETS.FACE_MATCH_CORRECTIONS), true);
  assert.equal(feedbackDoesNotAffect(entry.kind, FEEDBACK_TARGETS.CHILD_IDENTITY), true);
});

test('face-match correction copy says what changes without overclaiming model training', () => {
  const entry = assistantFeedbackTransparency(FEEDBACK_KINDS.FACE_MATCH_CORRECTION);
  const copy = `${entry.confirmBody} ${entry.successBody}`;

  assert.match(copy, /keeps the original in Photos/i);
  assert.match(copy, /photo-match correction/i);
  assert.match(copy, /auto-save pauses/i);
  assert.equal(feedbackDoesNotAffect(entry.kind, FEEDBACK_TARGETS.CAMERA_ROLL_ORIGINALS), true);
  assert.doesNotMatch(copy, /teach(?:es)? the model|learns from|confidence|threshold|delete originals/i);
});

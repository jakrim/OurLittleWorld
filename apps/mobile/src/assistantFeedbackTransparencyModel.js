// Parent-facing boundaries for assistant feedback. Keep this pure so copy and
// scope guarantees are testable without React Native or Supabase.

export const FEEDBACK_TARGETS = Object.freeze({
  FACE_MATCH_CORRECTIONS: 'face_match_corrections',
  FIRST_SUGGESTIONS: 'first_suggestions',
  PHOTO_STACK_CHOICES: 'photo_stack_choices',
  CAPTION_DRAFTS: 'caption_drafts',
  BOOK_READINESS: 'book_readiness',
  CHILD_IDENTITY: 'child_identity',
  CAMERA_ROLL_ORIGINALS: 'camera_roll_originals',
});

export const FEEDBACK_KINDS = Object.freeze({
  FACE_MATCH_CORRECTION: 'face_match_correction',
  FIRST_SUGGESTION_NOT_THIS: 'first_suggestion_not_this',
  PHOTO_STACK_CHOICE: 'photo_stack_choice',
  CAPTION_DRAFT_USE: 'caption_draft_use',
  BOOK_READINESS_ACTION: 'book_readiness_action',
});

const FEEDBACK_TRANSPARENCY = Object.freeze({
  [FEEDBACK_KINDS.FACE_MATCH_CORRECTION]: {
    kind: FEEDBACK_KINDS.FACE_MATCH_CORRECTION,
    scope: 'family_user_photo_scan',
    affects: [FEEDBACK_TARGETS.FACE_MATCH_CORRECTIONS],
    doesNotAffect: [
      FEEDBACK_TARGETS.FIRST_SUGGESTIONS,
      FEEDBACK_TARGETS.PHOTO_STACK_CHOICES,
      FEEDBACK_TARGETS.CAPTION_DRAFTS,
      FEEDBACK_TARGETS.BOOK_READINESS,
      FEEDBACK_TARGETS.CAMERA_ROLL_ORIGINALS,
    ],
    confirmBody: 'This removes it from the baby book, keeps the original in Photos, records a photo-match correction for future scans, and pauses auto-save until a parent reviews it.',
    successBody: 'The original stays in Photos. Future scans for this parent treat it as a photo-match correction, and auto-save pauses for review.',
  },
  [FEEDBACK_KINDS.FIRST_SUGGESTION_NOT_THIS]: {
    kind: FEEDBACK_KINDS.FIRST_SUGGESTION_NOT_THIS,
    scope: 'device_family_user_first_suggestions',
    affects: [FEEDBACK_TARGETS.FIRST_SUGGESTIONS],
    doesNotAffect: [
      FEEDBACK_TARGETS.FACE_MATCH_CORRECTIONS,
      FEEDBACK_TARGETS.CHILD_IDENTITY,
      FEEDBACK_TARGETS.PHOTO_STACK_CHOICES,
      FEEDBACK_TARGETS.CAPTION_DRAFTS,
      FEEDBACK_TARGETS.BOOK_READINESS,
    ],
    footer: 'Nothing is saved until you keep it. "Not this" only quiets First suggestions on this device.',
  },
  [FEEDBACK_KINDS.PHOTO_STACK_CHOICE]: {
    kind: FEEDBACK_KINDS.PHOTO_STACK_CHOICE,
    scope: 'current_review_batch',
    affects: [FEEDBACK_TARGETS.PHOTO_STACK_CHOICES],
    doesNotAffect: [
      FEEDBACK_TARGETS.FACE_MATCH_CORRECTIONS,
      FEEDBACK_TARGETS.FIRST_SUGGESTIONS,
      FEEDBACK_TARGETS.CAPTION_DRAFTS,
      FEEDBACK_TARGETS.BOOK_READINESS,
    ],
  },
  [FEEDBACK_KINDS.CAPTION_DRAFT_USE]: {
    kind: FEEDBACK_KINDS.CAPTION_DRAFT_USE,
    scope: 'current_text_field',
    affects: [FEEDBACK_TARGETS.CAPTION_DRAFTS],
    doesNotAffect: [
      FEEDBACK_TARGETS.FACE_MATCH_CORRECTIONS,
      FEEDBACK_TARGETS.FIRST_SUGGESTIONS,
      FEEDBACK_TARGETS.PHOTO_STACK_CHOICES,
      FEEDBACK_TARGETS.BOOK_READINESS,
    ],
  },
  [FEEDBACK_KINDS.BOOK_READINESS_ACTION]: {
    kind: FEEDBACK_KINDS.BOOK_READINESS_ACTION,
    scope: 'parent_saved_book_context',
    affects: [FEEDBACK_TARGETS.BOOK_READINESS],
    doesNotAffect: [
      FEEDBACK_TARGETS.FACE_MATCH_CORRECTIONS,
      FEEDBACK_TARGETS.FIRST_SUGGESTIONS,
      FEEDBACK_TARGETS.PHOTO_STACK_CHOICES,
      FEEDBACK_TARGETS.CAPTION_DRAFTS,
    ],
  },
});

export function assistantFeedbackTransparency(kind) {
  return FEEDBACK_TRANSPARENCY[kind] || null;
}

export function feedbackAffects(kind, target) {
  const entry = assistantFeedbackTransparency(kind);
  return !!entry?.affects?.includes(target);
}

export function feedbackDoesNotAffect(kind, target) {
  const entry = assistantFeedbackTransparency(kind);
  return !!entry?.doesNotAffect?.includes(target);
}

export function allAssistantFeedbackTransparency() {
  return Object.values(FEEDBACK_TRANSPARENCY);
}

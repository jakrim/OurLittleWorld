// Canonical Today assistant nudge selection. First match wins, one nudge at a
// time. No React Native imports — unit-tested with node --test.

import { FIRST_SUGGESTION_EYEBROW } from './firstSuggestionModel.js';
import { countLabel } from './plural.js';

export function selectDayCardNudge({
  blockingIssue = null,
  photoTrustNudge = null,
  tonightQueueCount = 0,
  waitingReviewCount = 0,
  firstSuggestion = null,
  catchupGoal = null,
  promptState = null,
  missedPrompt = null,
  bookReadinessNudge = null,
  digestUnread = false,
  babyName = '',
} = {}) {
  if (blockingIssue?.title) {
    return {
      kind: blockingIssue.kind || 'blocking-repair',
      eyebrow: blockingIssue.eyebrow || 'Needs attention',
      title: blockingIssue.title,
      route: blockingIssue.route ?? null,
    };
  }
  if (photoTrustNudge?.title && photoTrustNudge.trustState === 'needs_correction_review') {
    return {
      kind: photoTrustNudge.kind || 'photo-trust',
      eyebrow: photoTrustNudge.eyebrow || 'Photo assistant',
      title: photoTrustNudge.title,
      route: photoTrustNudge.route ?? null,
    };
  }
  if (tonightQueueCount > 0) {
    return {
      kind: 'tonight',
      eyebrow: "Tonight's memories",
      title: tonightQueueCount === 1
        ? '1 memory is ready for a quiet look'
        : `${tonightQueueCount} memories are ready for a quiet look`,
      route: '/tonight',
    };
  }
  if (photoTrustNudge?.title) {
    return {
      kind: photoTrustNudge.kind || 'photo-trust',
      eyebrow: photoTrustNudge.eyebrow || 'Photo assistant',
      title: photoTrustNudge.title,
      route: photoTrustNudge.route ?? null,
    };
  }
  if (waitingReviewCount > 0) {
    return {
      kind: 'review',
      eyebrow: 'Take a look',
      title: waitingReviewCount === 1
        ? '1 photo is waiting for a look'
        : `${waitingReviewCount} photos are waiting for a look`,
      route: '/review',
    };
  }
  // A suggestion outranks the catch-up question: it carries evidence (photos),
  // not just a reminder. Wording stays possible-only — never a claim.
  if (firstSuggestion?.title) {
    const photoCount = 1 + (firstSuggestion.alternates?.length || 0);
    return {
      kind: 'suggested-first',
      eyebrow: FIRST_SUGGESTION_EYEBROW,
      title: `${firstSuggestion.title} — ${photoCount} ${countLabel(photoCount, 'photo')} to look at`,
      route: '/firsts',
      goalKey: firstSuggestion.goalKey,
    };
  }
  if (catchupGoal) {
    return {
      kind: 'catchup',
      eyebrow: 'A first worth saving',
      title: `Did we ever save ${babyName ? `${babyName}'s` : 'the'} ${String(catchupGoal.title || '').toLowerCase()}?`,
      route: {
        pathname: '/first-compose',
        params: { title: catchupGoal.title, targetAge: catchupGoal.targetAgeLabel, goalKey: catchupGoal.key },
      },
      goalKey: catchupGoal.key,
    };
  }
  const prompt = promptState?.prompt;
  if (prompt && !promptState.mineAnswered && !promptState.snoozed) {
    return { kind: 'prompt', eyebrow: 'Daily prompt', title: prompt.text, route: '/prompt' };
  }
  if (missedPrompt?.promptDate && (missedPrompt.promptText || missedPrompt.prompt?.text)) {
    return {
      kind: 'missed-prompt',
      eyebrow: 'Worth answering',
      title: missedPrompt.promptText || missedPrompt.prompt.text,
      route: { pathname: '/prompt', params: { promptDate: missedPrompt.promptDate } },
      promptDate: missedPrompt.promptDate,
    };
  }
  if (bookReadinessNudge?.title) {
    return {
      kind: 'book-readiness',
      eyebrow: bookReadinessNudge.eyebrow || 'Remember',
      title: bookReadinessNudge.title,
      route: bookReadinessNudge.route || '/library',
    };
  }
  if (digestUnread) {
    return { kind: 'digest', eyebrow: 'This week', title: "This week's story is ready", route: '/digest' };
  }
  return { kind: 'fallback', eyebrow: 'Today', title: 'A small place for today.', route: null };
}

export function buildBlockingAssistantIssue({
  uploadQueue = null,
  iCloudWaitingCount = 0,
  scanFailed = false,
} = {}) {
  const failed = Math.max(0, Number(uploadQueue?.failed || 0));
  const total = Math.max(0, Number(uploadQueue?.total || 0));
  if (failed > 0) {
    return {
      kind: 'blocking-repair',
      eyebrow: 'Needs attention',
      title: 'Some memories did not finish saving',
      route: { pathname: '/library', params: { segment: 'photos' } },
    };
  }
  if (total > 0) {
    return {
      kind: 'blocking-repair',
      eyebrow: 'Still saving',
      title: total === 1 ? '1 memory is still finishing' : `${total} memories are still finishing`,
      route: { pathname: '/library', params: { segment: 'photos' } },
    };
  }
  const iCloudCount = Math.max(0, Number(iCloudWaitingCount || 0));
  if (iCloudCount > 0) {
    return {
      kind: 'icloud-wait',
      eyebrow: 'Needs attention',
      title: iCloudCount === 1
        ? '1 photo is waiting for iCloud'
        : `${iCloudCount.toLocaleString()} photos are waiting for iCloud`,
      route: '/scan',
    };
  }
  if (scanFailed) {
    return {
      kind: 'scan-repair',
      eyebrow: 'Needs attention',
      title: 'Photo scan needs another try',
      route: '/scan',
    };
  }
  return null;
}

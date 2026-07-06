// Day-card assistant nudge selection (B1, S5). First match wins, one nudge at
// a time. No React Native imports — unit-tested with node --test.

import { FIRST_SUGGESTION_EYEBROW } from './firstSuggestionModel.js';
import { countLabel } from './plural.js';

export function selectDayCardNudge({
  waitingReviewCount = 0,
  firstSuggestion = null,
  catchupGoal = null,
  promptState = null,
  digestUnread = false,
  babyName = '',
} = {}) {
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
  if (digestUnread) {
    return { kind: 'digest', eyebrow: 'This week', title: "This week's story is ready", route: '/digest' };
  }
  return { kind: 'fallback', eyebrow: 'Today', title: 'A small place for today.', route: null };
}

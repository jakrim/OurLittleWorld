// Day-card assistant nudge selection (B1). First match wins, one nudge at a time.
// No React Native imports — unit-tested with node --test.

export function selectDayCardNudge({
  waitingReviewCount = 0,
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

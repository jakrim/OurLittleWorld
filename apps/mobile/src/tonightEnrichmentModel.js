export const TONIGHT_FAVORITE_REACTION = 'heart';

export const TONIGHT_REACTION_OPTIONS = Object.freeze([
  { code: 'spark', emoji: '😂', label: 'Made me laugh' },
  { code: 'seen', emoji: '🥺', label: 'Holding this close' },
]);

export function buildTonightCommitPlan(item) {
  const steps = item?.commitSteps || {};
  return [
    { key: 'media', needed: true, complete: steps.media === 'saved' },
    { key: 'text', needed: Boolean(item?.draftText?.trim()), complete: ['saved', 'skipped'].includes(steps.text) },
    { key: 'voice', needed: Boolean(item?.draftVoice?.uri), complete: ['saved', 'skipped'].includes(steps.voice) },
    {
      key: 'reaction',
      needed: Boolean(item?.favorite || item?.reactionCode),
      complete: ['saved', 'skipped'].includes(steps.reaction),
    },
  ];
}

export function tonightReactionCodes(item) {
  const codes = [];
  if (item?.favorite) codes.push(TONIGHT_FAVORITE_REACTION);
  if (item?.reactionCode && item.reactionCode !== TONIGHT_FAVORITE_REACTION) codes.push(item.reactionCode);
  return codes;
}

export function tonightCommitStatus(item) {
  if (!item) return { label: '', tone: 'neutral' };
  if (item.commitState === 'failed') return { label: 'Saving paused. Your draft is safe.', tone: 'danger' };
  if (item.commitState === 'saving') {
    const plan = buildTonightCommitPlan(item);
    const active = plan.find((step) => item.commitSteps?.[step.key] === 'saving');
    const labels = {
      media: 'Saving this memory…',
      text: 'Adding your note…',
      voice: 'Adding your voice note…',
      reaction: 'Adding your favorite…',
    };
    return { label: labels[active?.key] || 'Saving this memory…', tone: 'neutral' };
  }
  return { label: '', tone: 'neutral' };
}

export function summarizeTonightCompletion(items = []) {
  const kept = items.filter((item) => item.state === 'kept');
  const skipped = items.filter((item) => item.state === 'skipped');
  return {
    kept: kept.length,
    skipped: skipped.length,
    withText: kept.filter((item) => item.commitSteps?.text === 'saved').length,
    withVoice: kept.filter((item) => item.commitSteps?.voice === 'saved').length,
    withReaction: kept.filter((item) => item.commitSteps?.reaction === 'saved').length,
  };
}

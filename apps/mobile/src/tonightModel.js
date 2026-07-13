import { digestHasContent } from './digestModel.js';
import { countLabel } from './plural.js';

const TONIGHT_MAX_ITEMS = 3;

export function buildTonightModel({
  promptState = null,
  pendingReviewCount = 0,
  recentPhotos = [],
  recentPhotoStack = null,
  firstSuggestion = null,
  digest = null,
  digestUnread = false,
  suppressedKinds = [],
} = {}) {
  const suppressed = new Set((suppressedKinds || []).filter(Boolean));
  const candidates = [
    promptCandidate(promptState),
    reviewCandidate(pendingReviewCount),
    firstSuggestionCandidate(firstSuggestion),
    recentStackCandidate(recentPhotoStack, recentPhotos),
    digestCandidate(digest, digestUnread),
  ].filter((item) => item && !suppressed.has(item.kind));
  const items = candidates
    .sort((a, b) => a.priority - b.priority)
    .slice(0, TONIGHT_MAX_ITEMS)
    .map(({ priority, ...item }) => item);

  return {
    visible: items.length > 0,
    title: 'Tonight',
    subtitle: 'A short evening pass through the book.',
    items,
  };
}

function promptCandidate(promptState) {
  const prompt = promptState?.prompt;
  if (!prompt?.text || promptState?.snoozed || promptIsAnswered(promptState)) return null;
  return {
    kind: 'prompt',
    priority: 10,
    eyebrow: 'Daily prompt',
    title: prompt.text,
    body: 'Answer in your words before the day moves on.',
    actionLabel: 'Answer',
    route: '/prompt',
  };
}

function reviewCandidate(count) {
  const value = Math.max(0, Number(count || 0));
  if (!value) return null;
  return {
    kind: 'review',
    priority: 20,
    eyebrow: 'Photo review',
    title: value === 1 ? '1 likely photo is ready for a look' : `${value} likely photos are ready for a look`,
    body: 'Keep only what belongs in the book.',
    actionLabel: 'Review',
    route: '/review',
    count: value,
  };
}

function firstSuggestionCandidate(suggestion) {
  if (!suggestion?.title) return null;
  const photoCount = 1 + (suggestion.alternates?.length || 0);
  return {
    kind: 'suggested-first',
    priority: 30,
    eyebrow: 'Worth a look',
    title: `${suggestion.title} may belong with Firsts`,
    body: `${photoCount} ${countLabel(photoCount, 'photo')} to check.`,
    actionLabel: 'Check',
    route: '/firsts',
    goalKey: suggestion.goalKey,
  };
}

function recentStackCandidate(stack, recentPhotos) {
  const normalized = normalizeRecentStack(stack, recentPhotos);
  if (normalized.count < 2) return null;
  return {
    kind: 'recent-stack',
    priority: 40,
    eyebrow: 'Recent chapter',
    title: `${normalized.count} recent ${countLabel(normalized.count, 'moment')} are ready to skim`,
    body: 'A quick pass keeps the chapter easy to revisit.',
    actionLabel: 'Open',
    route: { pathname: '/library', params: { segment: 'photos' } },
    count: normalized.count,
    thumbUrl: normalized.thumbUrl,
  };
}

function digestCandidate(digest, digestUnread) {
  if (!digestHasContent(digest)) return null;
  return {
    kind: 'digest',
    priority: 50,
    eyebrow: 'This week',
    title: digestUnread ? "This week's story is ready" : 'Skim this week in the book',
    body: digest?.headline || 'A small recap is ready to revisit.',
    actionLabel: 'Open',
    route: '/digest',
  };
}

function promptIsAnswered(promptState) {
  if (promptState?.mineAnswered) return true;
  const mine = promptState?.mine;
  return !!(mine?.response_text || mine?.moment_id);
}

function normalizeRecentStack(stack, recentPhotos) {
  if (stack?.count || stack?.photos?.length) {
    const photos = stack.photos || [];
    return {
      count: Math.max(0, Number(stack.count || photos.length || 0)),
      thumbUrl: stack.thumbUrl || photos.find((photo) => photo?.thumbUrl || photo?.fullUrl)?.thumbUrl || photos.find((photo) => photo?.fullUrl)?.fullUrl || null,
    };
  }
  const photos = (recentPhotos || []).filter(Boolean);
  return {
    count: Math.min(photos.length, 4),
    thumbUrl: photos.find((photo) => photo?.thumbUrl || photo?.fullUrl)?.thumbUrl || photos.find((photo) => photo?.fullUrl)?.fullUrl || null,
  };
}

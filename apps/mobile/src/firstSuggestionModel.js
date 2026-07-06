// Pure model logic for Suggested Firsts (Track S). No React Native imports —
// unit-tested with node --test. The assistant proposes; nothing is saved until
// a parent taps Keep. Copy must never claim certainty: "Possible first smile",
// never "We found the first smile".

import { isoDateForLocalDay, localDateFromISODate } from './ageModel.js';
import { featureDistance, PHOTO_STACK_NEAR_DUPLICATE_DISTANCE, qualityValue } from './photoStackModel.js';
import { AUTO_SAVE_CAPTURE_QUALITY_FLOOR } from './scanQualityModel.js';

// Mirrors REVIEW_THRESHOLD in recognitionTrust.js (not importable here — it
// pulls in the supabase client, and this file stays node-testable).
export const FIRST_SUGGESTION_MIN_SCORE = 0.65; // tunable
export const FIRST_SUGGESTION_MAX_ALTERNATES = 5; // tunable
export const FIRST_SUGGESTION_MIN_ALTERNATES = 2; // tunable
export const FIRST_SUGGESTION_ALTERNATE_TIME_GAP_MS = 10 * 60 * 1000; // tunable
export const FIRST_SUGGESTION_REGEN_INTERVAL_MS = 24 * 60 * 60 * 1000; // tunable
export const FIRST_SUGGESTION_DISMISS_DAYS = 30; // tunable, mirrors CATCHUP_DISMISS_DAYS
export const FIRST_SUGGESTION_SNOOZE_DAYS = 7; // tunable, Today-card soft snooze

export const FIRST_SUGGESTION_EYEBROW = 'Worth a look';
export const FIRST_SUGGESTION_FOOTER = 'Nothing is saved until you keep it.';
export const FIRST_SUGGESTION_SOURCE_CAPTION = 'from your photo library';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// { createdAfterMs, createdBeforeMs } | null when the window hasn't started,
// the birthday is missing, or the goal has no window. Past-window goals still
// get a window (capped at today) — the catch-up card handles the reminder,
// this handles the evidence.
export function suggestionWindowForGoal({ goal, babyBirthday, now = new Date() } = {}) {
  const birth = localDateFromISODate(babyBirthday);
  const minDays = finiteOrNull(goal?.targetAgeMinDays ?? goal?.target_age_min_days);
  const maxDays = finiteOrNull(goal?.targetAgeMaxDays ?? goal?.target_age_max_days);
  if (!birth || minDays == null || maxDays == null) return null;

  const start = new Date(birth.getFullYear(), birth.getMonth(), birth.getDate() + minDays);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (start.getTime() > today.getTime()) return null;

  let end = new Date(birth.getFullYear(), birth.getMonth(), birth.getDate() + maxDays);
  if (end.getTime() > today.getTime()) end = today;
  const endExclusive = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  return { createdAfterMs: start.getTime(), createdBeforeMs: endExclusive.getTime() };
}

export function possibleFirstTitle(goal) {
  const title = String(goal?.title || '').trim();
  if (!title) return '';
  return `Possible ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
}

export function aroundDateLabel(creationTime) {
  const date = creationTime ? new Date(creationTime) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return `Around ${MONTH_SHORT[date.getMonth()]} ${date.getDate()}`;
}

export function suggestionCopy({ goal, primaryCreationTime } = {}) {
  return {
    title: possibleFirstTitle(goal),
    subtitle: aroundDateLabel(primaryCreationTime),
  };
}

// Builds one suggestion from scored scan matches, or null when nothing
// qualifies. Matches carry the scan shape: { assetId, score, captureQuality,
// sharpness, faceSizeRatio, featureVector, creationTime, uri, localUri }.
export function buildFirstSuggestion({
  goal,
  matches = [],
  ownerUserId = null,
  now = new Date(),
  minScore = FIRST_SUGGESTION_MIN_SCORE,
  qualityFloor = AUTO_SAVE_CAPTURE_QUALITY_FLOOR,
  maxAlternates = FIRST_SUGGESTION_MAX_ALTERNATES,
  excludedAssetIds = {},
} = {}) {
  if (!goal?.key) return null;
  const qualifying = matches.filter((match) => {
    if (!match?.assetId || excludedAssetIds[match.assetId]) return false;
    if (Number(match.score || 0) < minScore) return false;
    const captureQuality = finiteOrNull(match.captureQuality);
    return captureQuality == null || captureQuality >= qualityFloor;
  });
  if (!qualifying.length) return null;

  const ranked = [...qualifying].sort((a, b) =>
    qualityValue(b) - qualityValue(a)
    || Number(b.score || 0) - Number(a.score || 0)
    || timeOf(a) - timeOf(b));
  const primary = ranked[0];
  const alternates = [];
  for (const match of ranked.slice(1)) {
    if (alternates.length >= maxAlternates) break;
    const others = [primary, ...alternates];
    const isNearDuplicate = others.some((other) => {
      const distance = featureDistance(match, other);
      if (Number.isFinite(distance) && distance !== Infinity) {
        return distance < PHOTO_STACK_NEAR_DUPLICATE_DISTANCE;
      }
      return Math.abs(timeOf(match) - timeOf(other)) < FIRST_SUGGESTION_ALTERNATE_TIME_GAP_MS;
    });
    if (!isNearDuplicate) alternates.push(match);
  }

  const copy = suggestionCopy({ goal, primaryCreationTime: primary.creationTime });
  return {
    id: `first-suggestion:${goal.key}:${primary.assetId}`,
    goalKey: goal.key,
    detector: 'age-window',
    title: copy.title,
    aroundLabel: copy.subtitle,
    primary: suggestionPhoto(primary, ownerUserId),
    alternates: alternates.map((match) => suggestionPhoto(match, ownerUserId)),
    generatedAt: new Date(now).getTime(),
  };
}

export function normalizeFirstSuggestionState(input = null) {
  const raw = input && typeof input === 'object' ? input : {};
  return {
    suggestionsByGoal: plainObject(raw.suggestionsByGoal),
    feedback: {
      keeps: plainObject(raw.feedback?.keeps),
      notThis: plainObject(raw.feedback?.notThis),
      chooseAnother: plainObject(raw.feedback?.chooseAnother),
    },
    dismissedGoals: plainObject(raw.dismissedGoals),
    snoozedGoals: plainObject(raw.snoozedGoals),
    excludedAssetIds: plainObject(raw.excludedAssetIds),
    lastGeneratedAt: plainObject(raw.lastGeneratedAt),
  };
}

export function applySuggestionFeedback(state, { goalKey, action, assetId = null, now = new Date() } = {}) {
  const next = normalizeFirstSuggestionState(state);
  if (!goalKey) return next;
  const suggestion = next.suggestionsByGoal[goalKey] || null;

  if (action === 'keep') {
    next.feedback.keeps[goalKey] = (next.feedback.keeps[goalKey] || 0) + 1;
    delete next.suggestionsByGoal[goalKey];
    return next;
  }

  if (action === 'not_this') {
    next.feedback.notThis[goalKey] = (next.feedback.notThis[goalKey] || 0) + 1;
    const excludeId = assetId || suggestion?.primary?.assetId;
    if (excludeId) next.excludedAssetIds[excludeId] = true;
    next.dismissedGoals[goalKey] = new Date(now).getTime();
    delete next.suggestionsByGoal[goalKey];
    return next;
  }

  if (action === 'choose_another' && suggestion && assetId) {
    const promoted = suggestion.alternates.find((photo) => photo.assetId === assetId);
    if (!promoted) return next;
    next.feedback.chooseAnother[goalKey] = (next.feedback.chooseAnother[goalKey] || 0) + 1;
    next.suggestionsByGoal[goalKey] = {
      ...suggestion,
      aroundLabel: aroundDateLabel(promoted.creationTime),
      primary: promoted,
      alternates: [
        suggestion.primary,
        ...suggestion.alternates.filter((photo) => photo.assetId !== assetId),
      ],
    };
    return next;
  }

  return next;
}

export function applySuggestionSnooze(state, { goalKey, now = new Date(), days = FIRST_SUGGESTION_SNOOZE_DAYS } = {}) {
  const next = normalizeFirstSuggestionState(state);
  if (!goalKey) return next;
  next.snoozedGoals[goalKey] = new Date(now).getTime() + days * 24 * 60 * 60 * 1000;
  return next;
}

// goalRows carry `.completed` (buildFirstsModel output, same input shape as
// selectCatchupGoal).
export function shouldGenerateForGoal({
  state,
  goal,
  babyBirthday,
  now = new Date(),
  minIntervalMs = FIRST_SUGGESTION_REGEN_INTERVAL_MS,
} = {}) {
  const normalized = normalizeFirstSuggestionState(state);
  if (!goal?.key || goal.completed) return false;
  if (!suggestionWindowForGoal({ goal, babyBirthday, now })) return false;
  const nowMs = new Date(now).getTime();
  const dismissedAt = normalized.dismissedGoals[goal.key];
  if (dismissedAt && nowMs - dismissedAt < FIRST_SUGGESTION_DISMISS_DAYS * 24 * 60 * 60 * 1000) return false;
  const generatedAt = normalized.lastGeneratedAt[goal.key];
  if (generatedAt && nowMs - generatedAt < minIntervalMs) return false;
  return true;
}

// The single suggestion to surface (oldest window first, one at a time).
// Skips goals that are now done — the partner may have saved the first on
// their own device since generation.
export function selectSuggestionForDisplay(state, { goalRows = [], now = new Date() } = {}) {
  const normalized = normalizeFirstSuggestionState(state);
  const nowMs = new Date(now).getTime();
  const eligible = goalRows
    .filter((goal) => !goal.completed && normalized.suggestionsByGoal[goal.key])
    .filter((goal) => {
      const dismissedAt = normalized.dismissedGoals[goal.key];
      return !(dismissedAt && nowMs - dismissedAt < FIRST_SUGGESTION_DISMISS_DAYS * 24 * 60 * 60 * 1000);
    })
    .sort((a, b) => (a.targetAgeMinDays ?? 0) - (b.targetAgeMinDays ?? 0));
  return eligible.length ? normalized.suggestionsByGoal[eligible[0].key] : null;
}

// Same as selectSuggestionForDisplay but honors the Today-card snooze.
export function selectTodaySuggestion(state, { goalRows = [], now = new Date() } = {}) {
  const normalized = normalizeFirstSuggestionState(state);
  const nowMs = new Date(now).getTime();
  const unsnoozed = goalRows.filter((goal) => {
    const snoozedUntil = normalized.snoozedGoals[goal.key];
    return !(snoozedUntil && nowMs < snoozedUntil);
  });
  return selectSuggestionForDisplay(normalized, { goalRows: unsnoozed, now });
}

// Route params for Keep — hands the suggestion to the compose sheet fully
// drafted (S1 params). The parent can still edit everything before saving.
export function keepRouteForSuggestion(suggestion, goal) {
  if (!suggestion?.primary?.assetId || !goal?.key) return null;
  const params = {
    title: goal.title,
    targetAge: goal.targetAgeLabel || goal.target_age_label || '',
    goalKey: goal.key,
    seedAssetId: suggestion.primary.assetId,
  };
  if (suggestion.primary.ownerUserId) params.seedAssetOwnerUserId = suggestion.primary.ownerUserId;
  const seedUri = suggestion.primary.uri || suggestion.primary.localUri;
  if (seedUri) params.seedAssetUri = seedUri;
  const seedDate = suggestionSeedDate(suggestion);
  if (seedDate) params.seedDate = seedDate;
  return { pathname: '/first-compose', params };
}

export function suggestionSeedDate(suggestion) {
  const creationTime = suggestion?.primary?.creationTime;
  const date = creationTime ? new Date(creationTime) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return isoDateForLocalDay(date);
}

function suggestionPhoto(match, ownerUserId) {
  return {
    assetId: match.assetId,
    ownerUserId: ownerUserId || null,
    creationTime: finiteOrNull(match.creationTime),
    uri: match.uri || null,
    localUri: match.localUri || null,
    score: finiteOrNull(match.score),
    captureQuality: finiteOrNull(match.captureQuality),
  };
}

function timeOf(match) {
  const time = finiteOrNull(match?.creationTime);
  return time == null ? Number.MAX_SAFE_INTEGER : time;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

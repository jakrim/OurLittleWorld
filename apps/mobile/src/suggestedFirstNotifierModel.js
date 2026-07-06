// Pure decision logic for the suggested-firsts local notification (Y1).
// No React Native imports — unit-tested with node --test. The impure store +
// native scheduler live in suggestedFirstNotifier.js.

import { FIRST_SUGGESTION_EYEBROW } from './firstSuggestionModel.js';
import {
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
} from './notificationSettingsModel.js';

export const SUGGESTED_FIRSTS_CATEGORY = 'suggested_firsts';
export const SUGGESTED_FIRSTS_ROUTE = '/firsts';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'];

// "Three possible first-smile photos are ready to review." — count spelled
// out, milestone lowercased and hyphenated, guardrail wording ("possible").
export function suggestedFirstNotificationCopy(suggestion) {
  if (!suggestion?.title) return null;
  const photoCount = 1 + (suggestion.alternates?.length || 0);
  const milestone = suggestion.title
    .replace(/^Possible\s+/i, '')
    .trim()
    .replace(/\s+/g, '-'); // "first smile" -> "first-smile"
  const countWord = NUMBER_WORDS[photoCount] || String(photoCount);
  const capped = `${countWord.charAt(0).toUpperCase()}${countWord.slice(1)}`;
  const photoWord = photoCount === 1 ? 'photo' : 'photos';
  return {
    title: FIRST_SUGGESTION_EYEBROW,
    body: `${capped} possible ${milestone} ${photoWord} ${photoCount === 1 ? 'is' : 'are'} ready to review.`,
  };
}

// Pure gate: fire at most once per suggestion id, only when the category is
// enabled and we are outside quiet hours. `state` is the notifier store
// ({ notifiedIds: { [id]: epochMs } }).
export function shouldNotifySuggestedFirst({
  suggestion,
  preferences = null,
  state = null,
  now = new Date(),
} = {}) {
  if (!suggestion?.id) return false;
  const categoryEnabled = preferences?.categories?.[SUGGESTED_FIRSTS_CATEGORY];
  if (categoryEnabled === false) return false; // default-on: only an explicit false suppresses
  const notifiedIds = state?.notifiedIds || {};
  if (notifiedIds[suggestion.id]) return false;
  const quietStart = preferences?.quietStart || DEFAULT_QUIET_HOURS_START;
  const quietEnd = preferences?.quietEnd || DEFAULT_QUIET_HOURS_END;
  if (isWithinQuietHours(now, quietStart, quietEnd)) return false;
  return true;
}

// Local minutes-of-day quiet window, wrapping past midnight (21:00 -> 08:00).
export function isWithinQuietHours(now, quietStart, quietEnd) {
  const current = now.getHours() * 60 + now.getMinutes();
  const start = parseTimeToMinutes(quietStart);
  const end = parseTimeToMinutes(quietEnd);
  if (start == null || end == null || start === end) return false;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end; // wraps midnight
}

export function normalizeNotifierState(input = null) {
  const raw = input && typeof input === 'object' ? input : {};
  return { notifiedIds: plainObject(raw.notifiedIds) };
}

export function markSuggestedFirstNotified(state, suggestionId, now = new Date()) {
  const next = normalizeNotifierState(state);
  if (suggestionId) next.notifiedIds[suggestionId] = new Date(now).getTime();
  return next;
}

function parseTimeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

export const FACTUAL_COLLECTION_MODEL_VERSION = 'factual-collections-v1';
export const TONIGHT_COLLECTION_SUGGESTION_LIMIT = 4;

export function buildTonightCollectionSuggestions({ item, babyBirthday } = {}) {
  if (!item) return [];
  const day = normalizedDay(item.localDay) || dayFromCapture(item.captureTimeMs);
  const suggestions = [];
  if (item.mediaType === 'video') {
    suggestions.push(suggestion('media:videos', 'Videos', 'media_type', 'video'));
  } else {
    suggestions.push(suggestion('media:photos', 'Photos', 'media_type', 'image'));
  }
  if (day) {
    suggestions.push(suggestion(`month:${day.slice(0, 7)}`, monthTitle(day), 'date_month', day.slice(0, 7)));
    suggestions.push(suggestion(`year:${day.slice(0, 4)}`, day.slice(0, 4), 'date_year', day.slice(0, 4)));
    if (isFirstYearDay(day, babyBirthday)) {
      suggestions.push(suggestion('life:first-year', 'First year', 'life_stage', 'first-year'));
    }
  }
  return suggestions.slice(0, TONIGHT_COLLECTION_SUGGESTION_LIMIT);
}

export function selectedTonightCollectionKeys({ suggestions = [], draftKeys = null } = {}) {
  const available = new Set(suggestions.map((entry) => entry.key));
  if (draftKeys == null) return [...available];
  return [...new Set((draftKeys || []).filter((key) => available.has(key)))];
}

export function toggleTonightCollectionKey({ selectedKeys = [], key }) {
  const next = new Set(selectedKeys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return [...next];
}

export function collectionKindLabel(kind) {
  const labels = {
    year: 'Year',
    month: 'Month',
    media: 'Media',
    author: 'Parent',
    first: 'Confirmed First',
    place: 'Place',
    favorite: 'Favorite',
    reaction: 'Reaction',
    life_stage: 'Age',
  };
  return labels[kind] || 'Collection';
}

function suggestion(key, title, sourceCode, sourceRef) {
  return { key, title, sourceCode, sourceRef, selectedByDefault: true };
}

function normalizedDay(value) {
  const day = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function dayFromCapture(value) {
  const date = new Date(Number(value || 0));
  if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return null;
  return date.toISOString().slice(0, 10);
}

function monthTitle(day) {
  const date = new Date(`${day.slice(0, 7)}-01T12:00:00Z`);
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function isFirstYearDay(day, birthday) {
  const birth = normalizedDay(birthday);
  if (!birth) return false;
  const firstBirthday = new Date(`${birth}T12:00:00Z`);
  firstBirthday.setUTCFullYear(firstBirthday.getUTCFullYear() + 1);
  return day >= birth && day < firstBirthday.toISOString().slice(0, 10);
}

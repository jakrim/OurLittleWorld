// Suggested note templates (U1). One quiet sentence composed only from real
// metadata — the date, the child's computed age, and an inferred scene label.
// No adjectives, no invented feelings; offered under the note field, never
// auto-inserted. No React Native imports — unit-tested with node --test.

import { localDateFromISODate } from './ageModel.js';
import { firstHappenedAgeLabel } from './firstComposeSeedModel.js';
import { formatTagLabel, normalizeMomentTags } from './tagModel.js';

export const SUGGESTED_NOTE_LABEL = 'Suggested note';
export const SUGGESTED_NOTE_USE_LABEL = 'Use';
export const CONTEXT_DRAFT_LABEL = 'Suggested line';
export const CONTEXT_DRAFT_USE_LABEL = 'Use';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'Oct 1 — 2 months, 8 days old. Midday outing.' — every clause from stored
// fields. Empty string when there is no date to anchor to.
export function suggestedFirstNote({ babyBirthday, happenedDate, sceneLabels = [] } = {}) {
  const date = localDateFromISODate(happenedDate);
  if (!date) return '';
  const dateLabel = `${MONTH_SHORT[date.getMonth()]} ${date.getDate()}`;
  const ageLabel = firstHappenedAgeLabel({ babyBirthday, happenedDate });
  const scene = String((sceneLabels || [])[0] || '').trim();
  let sentence = ageLabel ? `${dateLabel} — ${ageLabel} old.` : `${dateLabel}.`;
  if (scene) sentence += ` ${scene}.`;
  return sentence;
}

// General context draft for parent-editable note fields. Every clause is a
// labeled fact supplied by metadata or parent-provided text; it never turns
// facts into a story claim.
export function factsOnlyContextDraft({
  babyBirthday,
  happenedAt,
  happenedDate,
  placeLabel,
  firstTitle,
  promptText,
  tags = [],
} = {}) {
  const dateIso = dateOnly(happenedDate || happenedAt);
  const date = localDateFromISODate(dateIso);
  const parts = [];
  if (date) {
    const dateLabel = `${MONTH_SHORT[date.getMonth()]} ${date.getDate()}`;
    const ageLabel = firstHappenedAgeLabel({ babyBirthday, happenedDate: dateIso });
    parts.push(ageLabel ? `${dateLabel} — ${ageLabel} old.` : `${dateLabel}.`);
  }
  const place = safeFact(placeLabel);
  if (place) parts.push(`Place: ${place}.`);
  const first = safeFact(firstTitle);
  if (first) parts.push(`First: ${first}.`);
  const prompt = safeFact(promptText);
  if (prompt) parts.push(`Prompt: ${prompt}`);
  const tagList = normalizeMomentTags(Array.isArray(tags) ? tags : String(tags || '').split(','))
    .map(formatTagLabel)
    .filter(Boolean);
  if (tagList.length) parts.push(`Tags: ${tagList.join(', ')}.`);
  return parts.join(' ');
}

function dateOnly(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return isoDateFromDate(value);
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return isoDateFromDate(parsed);
}

function isoDateFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function safeFact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

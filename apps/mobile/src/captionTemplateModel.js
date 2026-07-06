// Suggested note templates (U1). One quiet sentence composed only from real
// metadata — the date, the child's computed age, and an inferred scene label.
// No adjectives, no invented feelings; offered under the note field, never
// auto-inserted. No React Native imports — unit-tested with node --test.

import { localDateFromISODate } from './ageModel.js';
import { firstHappenedAgeLabel } from './firstComposeSeedModel.js';

export const SUGGESTED_NOTE_LABEL = 'Suggested note';
export const SUGGESTED_NOTE_USE_LABEL = 'Use';

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

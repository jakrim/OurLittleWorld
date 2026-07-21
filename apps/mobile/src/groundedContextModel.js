import { ageAt, formatAge, localCalendarDayDiff } from './ageModel.js';

export const GROUNDED_CONTEXT_MODEL_VERSION = 'grounded-context-v1';
export const NEARBY_FIRST_WINDOW_DAYS = 60;

export function composeGroundedMomentContext({
  capturedAt,
  babyBirthday,
  placeName,
  contextFacts = [],
  eventCompanions = [],
  locale,
} = {}) {
  const captured = validDate(capturedAt);
  if (!captured) return [];
  const facts = [];
  const age = babyBirthday ? ageAt(babyBirthday, captured.getTime()) : null;
  const dayLabel = age && !age.beforeBirth && Number.isInteger(age.totalDays)
    ? `Day ${age.totalDays + 1}`
    : null;
  const ageLabel = age && !age.beforeBirth ? formatAge(age) : null;
  if (dayLabel || ageLabel) {
    facts.push({
      key: 'age',
      icon: 'calendar-outline',
      label: [dayLabel, ageLabel].filter(Boolean).join(' · '),
      source: 'Birth date and capture date',
    });
  }

  const safePlace = safePlaceLabel(placeName);
  if (safePlace) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(captured);
    const dayPart = dayPartFor(captured);
    facts.push({
      key: 'place',
      icon: 'location-outline',
      label: `Taken at ${safePlace} on a ${weekday} ${dayPart}`,
      source: 'Place entered by a parent and capture date',
    });
  }

  const nearby = nearestConfirmedFirst(contextFacts, captured);
  if (nearby) {
    const happened = validDate(nearby.happenedAt);
    const days = localCalendarDayDiff(happened, captured);
    const relation = days === 0
      ? 'On the same day as'
      : days > 0
        ? `${days} day${days === 1 ? '' : 's'} after`
        : `${Math.abs(days)} day${days === -1 ? '' : 's'} before`;
    facts.push({
      key: `first:${nearby.sourceId}`,
      icon: 'flag-outline',
      label: `${relation} the First “${nearby.title}” that your family saved`,
      source: 'Parent-confirmed First and capture date',
      sourceId: nearby.sourceId,
    });
  }

  const distinctCompanions = new Set((eventCompanions || []).map((row) => row.momentId).filter(Boolean));
  if (distinctCompanions.size > 1) {
    facts.push({
      key: 'shared-event',
      icon: 'copy-outline',
      label: `${distinctCompanions.size} originals from this shared moment`,
      source: 'Exact match between already-saved family media',
    });
  }
  return facts;
}

export function nearestConfirmedFirst(contextFacts, capturedAt) {
  const captured = validDate(capturedAt);
  if (!captured) return null;
  return (contextFacts || [])
    .map((row) => ({
      sourceId: row.source_id || row.sourceId || row.first?.id,
      title: String(row.first?.title || row.title || '').trim(),
      happenedAt: row.first?.happened_at || row.happenedAt,
      done: row.first?.done ?? row.done,
    }))
    .filter((row) => row.sourceId && row.title && row.done !== false && validDate(row.happenedAt))
    .map((row) => ({
      ...row,
      distance: Math.abs(localCalendarDayDiff(validDate(row.happenedAt), captured)),
    }))
    .filter((row) => row.distance <= NEARBY_FIRST_WINDOW_DAYS)
    .sort((left, right) => left.distance - right.distance
      || String(left.happenedAt).localeCompare(String(right.happenedAt))
      || String(left.sourceId).localeCompare(String(right.sourceId)))[0] || null;
}

export function safePlaceLabel(value) {
  const label = String(value || '').trim();
  if (!label || label.length > 80) return '';
  if (/^[-+]?\d{1,3}(\.\d+)?\s*[,/]\s*[-+]?\d{1,3}(\.\d+)?$/i.test(label)) return '';
  return label;
}

export function groundedContextAnalytics(facts = []) {
  const fixedKinds = new Set(['age', 'place', 'first', 'shared-event']);
  return {
    fact_count: Math.min(4, facts.length),
    fact_kinds: [...new Set(facts.map((fact) => String(fact?.key || '').split(':')[0]))]
      .filter((kind) => fixedKinds.has(kind))
      .sort(),
  };
}

function dayPartFor(date) {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

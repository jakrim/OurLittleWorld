export const FIRST_YEAR_DAY_COUNT = 365;
export const CATCHUP_PACE_SMALL = 3;
export const CATCHUP_PACE_STANDARD = 5;
export const CATCHUP_PACE_HIGH = 7;

export function recommendedNightlySize({
  eligibleCount = 0,
  completedSessionCount = 0,
  continuation = false,
} = {}) {
  const eligible = Math.max(0, Number(eligibleCount || 0));
  if (eligible <= CATCHUP_PACE_SMALL) return eligible;
  if (continuation) return Math.min(CATCHUP_PACE_SMALL, eligible);
  const completed = Math.max(0, Number(completedSessionCount || 0));
  if (completed >= 3) return Math.min(CATCHUP_PACE_HIGH, eligible);
  if (completed >= 1) return Math.min(CATCHUP_PACE_STANDARD, eligible);
  return Math.min(CATCHUP_PACE_SMALL, eligible);
}

export function firstYearTargetBand(elapsedDays) {
  const anchors = Math.max(0, Math.min(FIRST_YEAR_DAY_COUNT, Number(elapsedDays || 0)));
  return {
    lower: anchors + Math.round(anchors * 0.27),
    upper: anchors + Math.round(anchors * 0.55),
  };
}

export function buildCatchupProgress({
  elapsedDays = 0,
  savedPhotoDays = 0,
  savedMemoryCount = 0,
  eligibleCount = 0,
  uncoveredEligibleDayCount = 0,
  unavailableCount = 0,
  accessPrivileges = 'all',
} = {}) {
  const targetBand = firstYearTargetBand(elapsedDays);
  const limited = accessPrivileges === 'limited';
  const remaining = Math.max(0, Number(eligibleCount || 0));
  return {
    elapsedDays: Math.max(0, Number(elapsedDays || 0)),
    savedPhotoDays: Math.max(0, Number(savedPhotoDays || 0)),
    savedMemoryCount: Math.max(0, Number(savedMemoryCount || 0)),
    remainingStrongCount: remaining,
    uncoveredEligibleDayCount: Math.max(0, Number(uncoveredEligibleDayCount || 0)),
    unavailableCount: Math.max(0, Number(unavailableCount || 0)),
    targetBand,
    hasMore: remaining > 0,
    limited,
    accessNote: limited
      ? 'This view is based only on the photos you selected for Our Little World.'
      : null,
  };
}

export function localDayInTimeZone(value = new Date(), timezone = 'UTC') {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('A valid date is required');
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const valueFor = (type) => parts.find((part) => part.type === type)?.value;
    return `${valueFor('year')}-${valueFor('month')}-${valueFor('day')}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function buildSavedDayCounts(rows = [], timezone = 'UTC') {
  const counts = new Map();
  for (const row of rows || []) {
    const capturedAt = row?.captured_at || row?.capturedAt;
    if (!capturedAt) continue;
    const day = localDayInTimeZone(capturedAt, timezone);
    counts.set(day, Number(counts.get(day) || 0) + 1);
  }
  return counts;
}

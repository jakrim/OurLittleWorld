// "On this day" selection logic (A4). Pure date math — no React Native imports,
// unit-tested with node --test. For children under two, exact-date annual matches
// are structurally empty, so we fall back to month-versary buckets.

export const MONTHVERSARY_BUCKET_MONTHS = [1, 2, 3, 6]; // tunable
export const MONTHVERSARY_WINDOW_DAYS = 1; // ± days around the month-versary (tunable)
export const MONTHVERSARY_MAX_PER_BUCKET = 6; // tunable
export const MONTHVERSARY_MAX_AGE_DAYS = 730; // under two years old

const MONTH_WORDS = { 1: 'one', 2: 'two', 3: 'three', 6: 'six' };

export function monthversaryLabel(babyName, monthsAgo) {
  const amount = MONTH_WORDS[monthsAgo] || String(monthsAgo);
  const phrase = `${amount} month${monthsAgo === 1 ? '' : 's'} ago today`;
  return babyName ? `${babyName}, ${phrase}` : `${phrase[0].toUpperCase()}${phrase.slice(1)}`;
}

// Same day-of-month N months back, clamping the 29th-31st to the last day of
// shorter months. Range spans the target day ± MONTHVERSARY_WINDOW_DAYS.
export function monthversaryBuckets({ now = new Date(), birthdayISO = null, months = MONTHVERSARY_BUCKET_MONTHS } = {}) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const birth = birthdayISO ? new Date(`${birthdayISO}T00:00:00`) : null;
  return months
    .map((monthsAgo) => {
      const year = today.getFullYear();
      const month = today.getMonth() - monthsAgo;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const target = new Date(year, month, Math.min(today.getDate(), lastDay));
      const start = new Date(target);
      start.setDate(start.getDate() - MONTHVERSARY_WINDOW_DAYS);
      const end = new Date(target);
      end.setDate(end.getDate() + MONTHVERSARY_WINDOW_DAYS + 1); // exclusive
      return { monthsAgo, target, start, end };
    })
    .filter((bucket) => !birth || bucket.end > birth);
}

// Exact month+day matches from prior years only — the "real" annual matches.
export function annualTodayMatches(shared, now = new Date()) {
  const today = new Date(now);
  return (shared || []).filter((photo) => {
    if (!photo.creation_time) return false;
    const captured = new Date(photo.creation_time);
    return captured.getFullYear() < today.getFullYear()
      && captured.getMonth() === today.getMonth()
      && captured.getDate() === today.getDate();
  }).slice(0, 6);
}

export function isUnderTwo(ageDays) {
  return ageDays != null && ageDays < MONTHVERSARY_MAX_AGE_DAYS;
}

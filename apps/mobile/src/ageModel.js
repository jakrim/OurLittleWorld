const DAY_MS = 24 * 60 * 60 * 1000;

export function localDateFromISODate(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).slice(0, 10));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function localCalendarDayDiff(start, end) {
  const left = start instanceof Date ? start : new Date(start);
  const right = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return null;
  return localDayOrdinal(right) - localDayOrdinal(left);
}

/**
 * Compute baby age at a given timestamp.
 * Returns a structured object so callers can format flexibly.
 */
export function ageAt(birthdayISO, takenAtMs) {
  if (!birthdayISO || takenAtMs == null) return null;
  const birth = localDateFromISODate(birthdayISO);
  const taken = new Date(takenAtMs);
  if (!birth || Number.isNaN(taken.getTime())) return null;

  let years = taken.getFullYear() - birth.getFullYear();
  let months = taken.getMonth() - birth.getMonth();
  let days = taken.getDate() - birth.getDate();

  if (days < 0) {
    months -= 1;
    const lastMonth = new Date(taken.getFullYear(), taken.getMonth(), 0);
    days += lastMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalDays = localCalendarDayDiff(birth, taken);
  const beforeBirth = totalDays < 0;

  return { years, months, days, totalDays, beforeBirth };
}

export function formatAge(age) {
  if (!age) return '';
  if (age.beforeBirth) return 'before they were born';
  if (age.totalDays === 0) return 'birth day';
  if (age.years === 0 && age.months === 0) {
    return `${age.totalDays} day${age.totalDays === 1 ? '' : 's'} old`;
  }
  if (age.years === 0) {
    const m = `${age.months} month${age.months === 1 ? '' : 's'}`;
    const d = age.days ? `, ${age.days} day${age.days === 1 ? '' : 's'}` : '';
    return `${m}${d}`;
  }
  const y = `${age.years} year${age.years === 1 ? '' : 's'}`;
  const m = age.months ? `, ${age.months} month${age.months === 1 ? '' : 's'}` : '';
  return `${y}${m}`;
}

function localDayOrdinal(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

const DEFAULT_MONTHIVERSARY_DAY = 1;

export function monthiversaryDayForFamily(family) {
  const birthDay = Number(String(family?.babyBirthday || '').split('-')[2]);
  if (!Number.isFinite(birthDay)) return null;
  return clampNumber(birthDay, 1, 31, DEFAULT_MONTHIVERSARY_DAY);
}

export function normalizeMonthiversaryDay({ row, family, fallback = DEFAULT_MONTHIVERSARY_DAY } = {}) {
  const derivedMonthiversaryDay = monthiversaryDayForFamily(family);
  if (derivedMonthiversaryDay != null) return derivedMonthiversaryDay;
  return clampNumber(row?.monthiversary_day ?? row?.monthiversaryDay, 1, 31, fallback);
}

export function formatMonthiversary(settings) {
  if (!settings?.monthiversaryEnabled) return 'Off';
  return `${ordinal(settings.monthiversaryDay)} monthly`;
}

function clampNumber(value, min, max, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, Math.round(next)));
}

function ordinal(value) {
  const day = clampNumber(value, 1, 31, DEFAULT_MONTHIVERSARY_DAY);
  if ([11, 12, 13].includes(day % 100)) return `${day}th`;
  const suffix = day % 10 === 1 ? 'st' : day % 10 === 2 ? 'nd' : day % 10 === 3 ? 'rd' : 'th';
  return `${day}${suffix}`;
}

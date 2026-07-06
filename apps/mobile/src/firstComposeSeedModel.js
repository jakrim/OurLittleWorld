import { isoDateForLocalDay, localDateFromISODate } from './ageModel.js';

export function defaultFirstHappenedDate({ babyBirthday, goal, now = new Date() } = {}) {
  const birth = localDateFromISODate(babyBirthday);
  const maxDays = finiteOrNull(goal?.targetAgeMaxDays ?? goal?.target_age_max_days);
  const minDays = finiteOrNull(goal?.targetAgeMinDays ?? goal?.target_age_min_days);
  const targetDays = maxDays ?? minDays;
  if (!birth || targetDays == null) return '';

  const target = new Date(birth.getFullYear(), birth.getMonth(), birth.getDate() + targetDays);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return isoDateForLocalDay(target.getTime() > today.getTime() ? today : target);
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

import { ageAt, formatAge, isoDateForLocalDay, localDateFromISODate } from './ageModel.js';

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

export function firstHappenedAgeLabel({ babyBirthday, happenedDate } = {}) {
  const happened = localDateFromISODate(happenedDate);
  if (!babyBirthday || !happened) return '';
  return formatAge(ageAt(babyBirthday, happened.getTime()));
}

export function firstHappenedDateCaption({
  babyBirthday,
  happenedDate,
  babyName = 'Your child',
} = {}) {
  const ageLabel = firstHappenedAgeLabel({ babyBirthday, happenedDate });
  if (!ageLabel) return 'Roughly when it happened is fine.';
  return `${babyName || 'Your child'}'s age on this date: ${ageLabel}. Roughly when it happened is fine.`;
}

export function firstPhotoHappenedDate(photo) {
  if (!photo?.creation_time) return '';
  const date = new Date(photo.creation_time);
  if (Number.isNaN(date.getTime())) return '';
  return isoDateForLocalDay(date);
}

export function firstPhotoSearchWindow({
  babyBirthday,
  happenedDate,
  goal,
  now = new Date(),
} = {}) {
  const birth = localDateFromISODate(babyBirthday);
  if (!birth) return null;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  let end = localDateFromISODate(happenedDate);
  if (!end) {
    const maxDays = finiteOrNull(goal?.targetAgeMaxDays ?? goal?.target_age_max_days);
    end = maxDays == null
      ? today
      : new Date(birth.getFullYear(), birth.getMonth(), birth.getDate() + maxDays);
  }
  if (end.getTime() > today.getTime()) end = today;
  if (end.getTime() < birth.getTime()) end = birth;

  const before = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  return {
    capturedOnOrAfter: birth.toISOString(),
    capturedBefore: before.toISOString(),
  };
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

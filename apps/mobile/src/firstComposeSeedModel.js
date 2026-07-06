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

export function normalizeSeedDateParam(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  return localDateFromISODate(text) ? text : '';
}

export function seedPhotoFromParams({
  seedAssetId,
  seedAssetOwnerUserId,
  seedAssetUri,
  seedDate,
  userId,
} = {}) {
  const assetId = String(seedAssetId || '').trim();
  if (!assetId) return null;
  const ownerUserId = String(seedAssetOwnerUserId || '').trim() || userId || null;
  if (!ownerUserId) return null;
  const day = normalizeSeedDateParam(seedDate);
  return {
    localOnly: ownerUserId === userId,
    asset_owner_user_id: ownerUserId,
    asset_id: assetId,
    creation_time: day ? localDateFromISODate(day).toISOString() : null,
    uri: String(seedAssetUri || '').trim() || null,
    localUri: null,
  };
}

export function mergeSeedIntoCandidates(candidates = [], seedPhoto = null) {
  if (!seedPhoto?.asset_id) return candidates;
  const seedKey = `${seedPhoto.asset_owner_user_id || ''}:${seedPhoto.asset_id}`;
  const existing = candidates.find(
    (photo) => `${photo?.asset_owner_user_id || ''}:${photo?.asset_id || ''}` === seedKey,
  );
  const rest = candidates.filter((photo) => photo !== existing);
  return [existing || seedPhoto, ...rest];
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

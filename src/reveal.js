import { ageAt, formatAge } from './photos';

export function firstLookStorageKey({ familyId, userId }) {
  return `olw:first-look:${familyId}:${userId}`;
}

export function shouldShowFirstLook({ family, user }) {
  if (!family?.id || !user?.id) return false;
  if (!family.babyName || !family.babyBirthday) return false;
  return family.createdBy !== user.id;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export { monthLabel };

function monthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function photoRank(photo) {
  const width = asNumber(photo.original_width);
  const height = asNumber(photo.original_height);
  const area = width * height;
  const ratio = width && height ? width / height : 1;
  const portraitBonus = ratio > 0 && ratio <= 0.95 ? 1_100_000 : 0;
  const qualityScore = asNumber(photo.face_score ?? photo.match_score ?? photo.score);
  const qualityBonus = qualityScore > 0 ? qualityScore * 1_600_000 : 0;
  const hasThumb = photo.thumbUrl ? 1_000_000_000_000 : 0;
  return hasThumb + Math.min(area, 12_000_000) + portraitBonus + qualityBonus;
}

function chooseHero(items) {
  if (!items.length) return null;
  return [...items].sort((a, b) => {
    const rankDelta = photoRank(b) - photoRank(a);
    if (rankDelta) return rankDelta;
    const at = a.creation_time ? +new Date(a.creation_time) : 0;
    const bt = b.creation_time ? +new Date(b.creation_time) : 0;
    return bt - at;
  })[0];
}

export function buildMonthlyHeroes(items, babyBirthday, now = new Date()) {
  if (!babyBirthday) return [];
  const birth = new Date(babyBirthday);
  if (Number.isNaN(birth.getTime())) return [];

  const buckets = new Map();
  const cursor = new Date(birth.getFullYear(), birth.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 1);

  while (cursor <= last) {
    const key = monthKey(cursor);
    const age = ageAt(babyBirthday, monthEnd(cursor).getTime());
    buckets.set(key, {
      key,
      monthLabel: monthLabel(cursor),
      ageLabel: age ? formatAge(age) : '',
      items: [],
      hero: null,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const item of items || []) {
    if (!item.creation_time) continue;
    const dt = new Date(item.creation_time);
    if (Number.isNaN(dt.getTime()) || dt < birth || dt > now) continue;
    const bucket = buckets.get(monthKey(dt));
    if (bucket) bucket.items.push(item);
  }

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    hero: chooseHero(bucket.items),
  }));
}

export function pickRevealHeroes(months, limit = 10) {
  const heroes = (months || []).filter((month) => month.hero);
  if (heroes.length <= limit) return heroes;

  const lastIndex = heroes.length - 1;
  return Array.from({ length: limit }, (_, i) => {
    const idx = Math.round((i / (limit - 1)) * lastIndex);
    return heroes[idx];
  });
}

export function findTodayInLife(items, babyBirthday, now = new Date()) {
  if (!items?.length || !babyBirthday) return [];
  const today = now.getDate();
  const todayKey = now.toDateString();
  const birth = new Date(babyBirthday);
  const byMonth = new Map();

  for (const item of items) {
    if (!item?.creation_time) continue;
    const dt = new Date(item.creation_time);
    if (Number.isNaN(dt.getTime()) || dt < birth) continue;
    if (dt.toDateString() === todayKey || dt.getDate() !== today) continue;
    const key = monthKey(dt);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(item);
  }

  return Array.from(byMonth.values())
    .map((monthItems) => chooseHero(monthItems))
    .filter(Boolean)
    .sort((a, b) => +new Date(b.creation_time) - +new Date(a.creation_time));
}

/**
 * Monthiversaries — the day of the month that matches the baby's birth day
 * across each month. e.g. born July 23 → August 23 (1 mo), September 23 (2 mo),
 * etc. For each month-mark we pick the best photo within a +/- window so the
 * monthly milestone always has something to show.
 */
export function buildMonthiversaries(items, babyBirthday, now = new Date(), { windowDays = 5 } = {}) {
  if (!babyBirthday) return [];
  const birth = new Date(babyBirthday);
  if (Number.isNaN(birth.getTime())) return [];
  const birthDay = birth.getDate();

  const out = [];
  const cursor = new Date(birth.getFullYear(), birth.getMonth() + 1, 1);
  const stop = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  let monthIndex = 1;
  while (cursor < stop) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const targetDay = Math.min(birthDay, lastDayOfMonth);
    const target = new Date(year, month, targetDay, 12, 0, 0);
    const lo = new Date(target);
    lo.setDate(lo.getDate() - windowDays);
    const hi = new Date(target);
    hi.setDate(hi.getDate() + windowDays);

    const candidates = (items || []).filter((item) => {
      if (!item?.creation_time) return false;
      const dt = new Date(item.creation_time);
      if (Number.isNaN(dt.getTime())) return false;
      return dt >= lo && dt <= hi;
    });

    const hero = chooseHero(candidates);
    out.push({
      key: `mv-${year}-${String(month + 1).padStart(2, '0')}`,
      monthIndex,
      ageLabel: `${monthIndex} month${monthIndex === 1 ? '' : 's'}`,
      target,
      targetLabel: target.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }),
      hero,
      candidateCount: candidates.length,
    });

    cursor.setMonth(cursor.getMonth() + 1);
    monthIndex += 1;
  }

  return out;
}

/**
 * Pick a single representative photo for a "for you" rail mode.
 * Used to auto-fill the random modes card with actual previews.
 *
 *   pickPhotoForMode('random', items, { ... })
 */
export function pickPhotoForMode(mode, items, opts = {}) {
  const {
    babyBirthday,
    now = new Date(),
    metadataByKey = {},
    memoriesByKey = {},
  } = opts;

  if (!items?.length) return null;

  if (mode === 'today') {
    const today = findTodayInLife(items, babyBirthday, now);
    return today[0] || null;
  }

  if (mode === 'monthiversary') {
    const all = buildMonthiversaries(items, babyBirthday, now);
    const withHero = all.filter((m) => m.hero);
    return withHero.length ? withHero[withHero.length - 1].hero : null;
  }

  if (mode === 'place') {
    const located = items.filter((p) => {
      const key = `${p.asset_owner_user_id}:${p.asset_id}`;
      return !!metadataByKey[key]?.location;
    });
    return located.length ? located[Math.floor(Math.random() * located.length)] : null;
  }

  if (mode === 'quote') {
    const noted = items.filter((p) => {
      const key = `${p.asset_owner_user_id}:${p.asset_id}`;
      return (memoriesByKey[key] || []).some((m) => m.note?.trim());
    });
    return noted.length ? noted[Math.floor(Math.random() * noted.length)] : null;
  }

  if (mode === 'month') {
    const thisMonth = items.filter((p) => {
      if (!p.creation_time) return false;
      const d = new Date(p.creation_time);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    return thisMonth.length ? thisMonth[Math.floor(Math.random() * thisMonth.length)] : null;
  }

  return items[Math.floor(Math.random() * items.length)];
}

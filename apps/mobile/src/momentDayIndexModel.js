import { localDayInTimeZone } from './firstYearCatchupModel.js';

export function buildMomentDayIndexRows({ moments = [], mediaRows = [], timezone = 'UTC' } = {}) {
  const momentsById = new Map((moments || []).map((moment) => [moment.id, moment]));
  const byDay = new Map();
  for (const media of mediaRows || []) {
    const moment = momentsById.get(media.moment_id);
    if (!moment?.captured_at) continue;
    const day = localDayInTimeZone(moment.captured_at, timezone);
    const current = byDay.get(day) || {
      day,
      capturedAt: moment.captured_at,
      coverMomentId: moment.id,
      coverPath: null,
      imageCount: 0,
      videoCount: 0,
    };
    if (media.media_type === 'video') current.videoCount += 1;
    else current.imageCount += 1;
    const candidateCoverPath = media.media_type === 'video'
      ? media.metadata?.posterPath || media.metadata?.thumbPath || null
      : media.metadata?.thumbPath || media.metadata?.fullPath || null;
    if (candidateCoverPath && (!current.coverPath
      || new Date(moment.captured_at).getTime() > new Date(current.capturedAt).getTime())) {
      current.coverMomentId = moment.id;
      current.capturedAt = moment.captured_at;
      current.coverPath = candidateCoverPath;
    }
    byDay.set(day, current);
  }
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}

export function buildMomentDayDetailRows({ moments = [], mediaRows = [] } = {}) {
  const mediaByMoment = new Map();
  for (const media of mediaRows || []) {
    if (!media?.moment_id) continue;
    if (!mediaByMoment.has(media.moment_id)) mediaByMoment.set(media.moment_id, []);
    mediaByMoment.get(media.moment_id).push(media);
  }
  return (moments || []).map((moment) => {
    const media = [...(mediaByMoment.get(moment.id) || [])]
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)
        || String(a.id || '').localeCompare(String(b.id || '')));
    const imageCount = media.filter((item) => item.media_type !== 'video').length;
    const videoCount = media.length - imageCount;
    const coverPath = media.map((item) => (item.media_type === 'video'
      ? item.metadata?.posterPath || item.metadata?.thumbPath || null
      : item.metadata?.thumbPath || item.metadata?.fullPath || null)).find(Boolean) || null;
    return {
      key: `moment:${moment.id}`,
      capturedAt: moment.captured_at,
      imageCount,
      videoCount,
      coverPath,
      momentId: moment.id,
    };
  }).filter((row) => row.imageCount || row.videoCount)
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
      || String(a.momentId).localeCompare(String(b.momentId)));
}

export function utcRangeForLocalDay(day, timezone = 'UTC') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return null;
  const nextDate = new Date(`${day}T12:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const nextDay = nextDate.toISOString().slice(0, 10);
  const startMs = firstUtcInstantForLocalDay(day, timezone);
  const endMs = firstUtcInstantForLocalDay(nextDay, timezone);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

function firstUtcInstantForLocalDay(day, timezone) {
  const noonUtc = new Date(`${day}T12:00:00Z`).getTime();
  let low = noonUtc - (40 * 60 * 60 * 1000);
  let high = noonUtc + (40 * 60 * 60 * 1000);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (localDayInTimeZone(mid, timezone) < day) low = mid + 1;
    else high = mid;
  }
  return low;
}

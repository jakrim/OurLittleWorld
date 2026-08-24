import { areLookalikes } from './bestPhotoCandidateModel.js';
import { isPinnedMatch, qualityValue } from './photoStackModel.js';
import { shouldAutoSaveMatch } from './scanQualityModel.js';
import { firstYearTargetBand, localDayInTimeZone } from './firstYearCatchupModel.js';

export const DAILY_CURATION_MIN_IDENTITY_SCORE = 0.62;
export const DAILY_CURATION_STANDOUT_QUALITY = 0.68;
export const DAILY_CURATION_STANDOUT_IDENTITY = 0.75;
export const DAILY_CURATION_LIKELY_SMILE_SCORE = 0.68;
export const DAILY_CURATION_VIDEO_MIN_IDENTITY = 0.72;
export const DAILY_CURATION_VIDEO_MIN_DURATION_SEC = 2;
export const DAILY_CURATION_VIDEO_MAX_PER_DAY = Number.POSITIVE_INFINITY;
export const DAILY_CURATION_PHOTO_MAX_PER_DAY = Number.POSITIVE_INFINITY;
export const FIRST_YEAR_DAY_COUNT = 365;

export function buildDailyCurationPlan(matches = [], {
  minIdentityScore = DAILY_CURATION_MIN_IDENTITY_SCORE,
  autoSaveOnly = false,
  autoSaveScoreThreshold = 0.9,
  maxPhotosPerDay = DAILY_CURATION_PHOTO_MAX_PER_DAY,
  maxVideosPerDay = DAILY_CURATION_VIDEO_MAX_PER_DAY,
} = {}) {
  const unique = bestMatchPerAsset(matches);
  const eligible = unique.filter((match) => {
    if (Number(match?.score || 0) < minIdentityScore) return false;
    if (autoSaveOnly && !shouldAutoSaveMatch(match, { scoreThreshold: autoSaveScoreThreshold })) return false;
    return !!curationDayKey(match?.creationTime || match?.creation_time);
  });
  const byDay = new Map();
  for (const match of eligible) {
    const key = curationDayKey(match.creationTime || match.creation_time);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(match);
  }

  const days = [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dayKey, rows]) => curateDay(dayKey, rows, { maxPhotosPerDay, maxVideosPerDay }));
  const selectedMatches = days.flatMap((day) => day.selected);
  const decisionByAssetId = Object.fromEntries(selectedMatches.map((match) => [
    match.assetId,
    match.curation,
  ]));

  return {
    days,
    selectedMatches,
    selectedAssetIds: new Set(selectedMatches.map((match) => match.assetId)),
    decisionByAssetId,
    dayCount: days.length,
    photoDayCount: days.filter((day) => day.photos.length > 0).length,
    videoDayCount: days.filter((day) => day.videos.length > 0).length,
    photoCount: days.reduce((sum, day) => sum + day.photos.length, 0),
    videoCount: days.reduce((sum, day) => sum + day.videos.length, 0),
  };
}

export function buildSavedDailyAlbum(records = [], {
  babyBirthday = null,
  now = new Date(),
  recentLimit = 14,
  timezone = null,
} = {}) {
  const byDay = new Map();
  for (const record of records || []) {
    if (Number(record?.imageCount || 0) <= 0 && Number(record?.videoCount || 0) <= 0) continue;
    const capturedAt = record?.capturedAt || record?.moment?.captured_at || record?.photo?.creation_time;
    const dayKey = stableSavedDayKey(capturedAt, timezone);
    if (!dayKey) continue;
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(record);
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dayKey, dayRecords]) => {
      const photos = dayRecords.filter((record) => Number(record?.imageCount || 0) > 0);
      const videos = dayRecords.filter((record) => Number(record?.videoCount || 0) > 0);
      return {
        dayKey,
        records: dayRecords,
        photos,
        videos,
        representative: strongestSavedRecord(photos.length ? photos : dayRecords),
      };
    });
  const birthday = parseLocalDate(babyBirthday);
  const today = parseLocalDate(stableSavedDayKey(now, timezone));
  const elapsedDays = birthday && today
    ? Math.max(0, Math.floor((calendarDayOrdinal(today) - calendarDayOrdinal(birthday)) / 86400000) + 1)
    : 0;
  const firstYearElapsedDays = Math.min(FIRST_YEAR_DAY_COUNT, elapsedDays);
  const firstYearEnd = birthday ? new Date(birthday.getFullYear() + 1, birthday.getMonth(), birthday.getDate()) : null;
  const firstYearPhotoDays = birthday
    ? days.filter((day) => {
      const value = parseLocalDate(day.dayKey);
      return value && value >= birthday && (!firstYearEnd || value < firstYearEnd) && day.photos.length > 0;
    }).length
    : days.filter((day) => day.photos.length > 0).length;
  const dayByKey = new Map(days.map((day) => [day.dayKey, day]));
  const firstYearDays = birthday
    ? Array.from({ length: firstYearElapsedDays }, (_, index) => {
      const date = new Date(birthday.getFullYear(), birthday.getMonth(), birthday.getDate() + index, 12);
      const dayKey = curationDayKey(date);
      return {
        dayKey,
        dayNumber: index + 1,
        ...(dayByKey.get(dayKey) || {
          records: [],
          photos: [],
          videos: [],
          representative: null,
        }),
      };
    }).reverse()
    : [];

  return {
    days,
    firstYearDays,
    recentDays: days.filter((day) => day.representative).slice(0, recentLimit),
    savedDayCount: days.length,
    photoDayCount: days.filter((day) => day.photos.length > 0).length,
    videoDayCount: days.filter((day) => day.videos.length > 0).length,
    firstYearElapsedDays,
    firstYearPhotoDays,
    savedMemoryCount: days.reduce((sum, day) => sum + day.records.length, 0),
    firstYearTargetBand: firstYearTargetBand(firstYearElapsedDays),
    firstYearComplete: firstYearPhotoDays >= FIRST_YEAR_DAY_COUNT,
  };
}

function stableSavedDayKey(value, timezone) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return String(value);
  if (!timezone) return curationDayKey(value);
  try {
    return localDayInTimeZone(value, timezone);
  } catch {
    return '';
  }
}

export function dailyArchiveRecordsFromMoments(moments = []) {
  return (moments || []).map((moment, index) => {
    const media = moment?.media || [];
    const firstMedia = media[0] || null;
    return {
      key: `moment:${moment?.id || moment?.captured_at || index}`,
      capturedAt: moment?.captured_at || moment?.created_at || null,
      imageCount: media.filter((item) => item?.media_type !== 'video').length,
      videoCount: media.filter((item) => item?.media_type === 'video').length,
      thumbUrl: firstMedia?.thumbUrl || firstMedia?.posterUrl || firstMedia?.fullUrl || null,
      moment,
    };
  }).filter((record) => record.imageCount > 0 || record.videoCount > 0);
}

export function curationDayKey(value) {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function curateDay(dayKey, rows, { maxPhotosPerDay, maxVideosPerDay }) {
  const photoCandidates = rows.filter((match) => match.mediaType !== 'video').sort(compareCandidate);
  const videoCandidates = rows.filter((match) => match.mediaType === 'video').sort(compareVideo);
  const photos = [];

  if (photoCandidates[0]) {
    photos.push(withCuration(photoCandidates[0], dayKey, 'daily-anchor', 'best-photo-for-day'));
  }
  for (const match of photoCandidates) {
    if (photos.length >= maxPhotosPerDay) break;
    if (photos.some((kept) => kept.assetId === match.assetId || areLookalikes(kept, match))) continue;
    const reason = standoutPhotoReason(match);
    if (!reason) continue;
    photos.push(withCuration(match, dayKey, 'standout-photo', reason));
  }

  const videos = [];
  for (const match of videoCandidates) {
    if (videos.length >= maxVideosPerDay) break;
    if (!isSpecialVideo(match)) continue;
    if (videos.some((kept) => areLookalikes(kept, match))) continue;
    videos.push(withCuration(match, dayKey, 'standout-video', videoReason(match)));
  }

  if (!photos.length && videos[0]) {
    videos[0] = withCuration(videos[0], dayKey, 'daily-video-anchor', videos[0].curation.reason);
  }
  return {
    dayKey,
    anchor: photos[0] || videos[0] || null,
    photos,
    videos,
    selected: [...photos, ...videos].sort((a, b) => candidateTime(b) - candidateTime(a)),
  };
}

function standoutPhotoReason(match) {
  if (isPinnedMatch(match)) return 'parent-pick';
  const quality = qualityValue(match);
  const score = Number(match?.score || 0);
  const smile = finiteOrNull(match?.smileScore ?? match?.likelySmileScore);
  if (smile != null && smile >= DAILY_CURATION_LIKELY_SMILE_SCORE && quality >= 0.3) return 'likely-smile';
  if (quality >= DAILY_CURATION_STANDOUT_QUALITY && score >= DAILY_CURATION_STANDOUT_IDENTITY) return 'high-quality-distinct';
  if (score >= 0.92 && quality >= 0.45) return 'clear-distinct-moment';
  return null;
}

function isSpecialVideo(match) {
  if (isPinnedMatch(match)) return true;
  const durationSec = normalizedDurationSec(match?.duration ?? match?.durationSec);
  if (durationSec != null && durationSec < DAILY_CURATION_VIDEO_MIN_DURATION_SEC) return false;
  const score = Number(match?.score || 0);
  if (score < DAILY_CURATION_VIDEO_MIN_IDENTITY) return false;
  const presence = finiteOrNull(match?.videoPresenceRatio);
  const quality = qualityValue(match);
  if (presence != null && presence >= 0.66 && quality >= 0.25) return true;
  return score >= 0.9 && quality >= 0.35;
}

function videoReason(match) {
  if (isPinnedMatch(match)) return 'parent-pick';
  if (Number(match?.videoPresenceRatio || 0) >= 0.66) return 'baby-present-across-video';
  return 'clear-video-moment';
}

function bestMatchPerAsset(matches) {
  const byId = new Map();
  for (const match of matches || []) {
    const id = match?.assetId || match?.asset_id;
    if (!id) continue;
    const current = byId.get(id);
    if (!current || compareCandidate(match, current) < 0) byId.set(id, { ...match, assetId: id });
  }
  return [...byId.values()];
}

function compareCandidate(a, b) {
  return Number(isPinnedMatch(b)) - Number(isPinnedMatch(a))
    || qualityValue(b) - qualityValue(a)
    || Number(b?.score || 0) - Number(a?.score || 0)
    || candidateTime(b) - candidateTime(a)
    || String(a?.assetId || '').localeCompare(String(b?.assetId || ''));
}

function compareVideo(a, b) {
  return Number(isPinnedMatch(b)) - Number(isPinnedMatch(a))
    || Number(b?.videoPresenceRatio || 0) - Number(a?.videoPresenceRatio || 0)
    || compareCandidate(a, b);
}

function withCuration(match, dayKey, role, reason) {
  return {
    ...match,
    curation: { dayKey, role, reason },
  };
}

function strongestSavedRecord(records) {
  return [...(records || [])].sort((a, b) =>
    savedRecordQuality(b) - savedRecordQuality(a)
      || candidateTime(b) - candidateTime(a)
      || String(a?.key || '').localeCompare(String(b?.key || '')),
  )[0] || null;
}

function savedRecordQuality(record) {
  const media = record?.moment?.media?.[0] || record?.photo?.moment_media || {};
  return qualityValue({
    captureQuality: media?.metadata?.captureQuality,
    sharpness: media?.metadata?.sharpness,
    faceSizeRatio: media?.metadata?.faceSizeRatio,
  });
}

function candidateTime(value) {
  const raw = value?.creationTime ?? value?.creation_time ?? value?.capturedAt ?? value?.moment?.captured_at ?? value;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const parsed = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedDurationSec(value) {
  const duration = finiteOrNull(value);
  if (duration == null) return null;
  return duration > 1000 ? duration / 1000 : duration;
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseLocalDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarDayOrdinal(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

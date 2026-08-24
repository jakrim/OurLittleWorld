import { PHOTO_STACK_FALLBACK_BURST_GAP_MS, qualityValue } from './photoStackModel.js';

export const FAMILY_EVENT_FALLBACK_GAP_MS = PHOTO_STACK_FALLBACK_BURST_GAP_MS;

export function groupArchiveRecordsForPresentation(records = [], {
  fallbackGapMs = FAMILY_EVENT_FALLBACK_GAP_MS,
} = {}) {
  const sorted = [...(records || [])]
    .filter(Boolean)
    .sort((a, b) => recordTime(b) - recordTime(a));
  const groups = [];

  for (const record of sorted) {
    const previousGroup = groups[groups.length - 1];
    const previous = previousGroup?.records?.[previousGroup.records.length - 1];
    if (previous && canSharePresentationGroup(previous, record, fallbackGapMs)) {
      previousGroup.records.push(record);
      previousGroup.representative = bestRecord(previousGroup.records);
      previousGroup.hiddenCount = Math.max(0, previousGroup.records.length - 1);
      previousGroup.imageCount = previousGroup.records.reduce((sum, item) => sum + Number(item.imageCount || 0), 0);
      previousGroup.videoCount = previousGroup.records.reduce((sum, item) => sum + Number(item.videoCount || 0), 0);
      continue;
    }

    groups.push({
      key: `event:${record.key}`,
      representative: record,
      records: [record],
      hiddenCount: 0,
      imageCount: Number(record.imageCount || 0),
      videoCount: Number(record.videoCount || 0),
    });
  }

  return groups;
}

export function collapsePlacePhotosIntoEvents(photos = [], {
  fallbackGapMs = FAMILY_EVENT_FALLBACK_GAP_MS,
} = {}) {
  const sorted = [...(photos || [])]
    .filter(Boolean)
    .sort((a, b) => photoTime(b) - photoTime(a));
  const groups = [];
  const momentGroup = new Map();

  for (const photo of sorted) {
    const momentId = photo?.moment_id || null;
    let group = momentId ? momentGroup.get(momentId) : null;
    if (!group) {
      const previous = groups[groups.length - 1];
      if (!momentId && previous && !previous.momentId) {
        const last = previous.photos[previous.photos.length - 1];
        if (Math.abs(photoTime(last) - photoTime(photo)) <= fallbackGapMs) group = previous;
      }
    }

    if (!group) {
      group = {
        key: momentId
          ? `moment:${momentId}`
          : `photo-event:${photo?.asset_owner_user_id || 'owner'}:${photo?.asset_id || groups.length}`,
        momentId,
        photos: [],
        representative: photo,
      };
      groups.push(group);
      if (momentId) momentGroup.set(momentId, group);
    }
    group.photos.push(photo);
    group.representative = bestPhoto(group.photos);
    group.hiddenCount = Math.max(0, group.photos.length - 1);
  }

  return groups;
}

export function bestPromptPhoto(sharedPhotos = [], {
  promptDate = null,
  now = new Date(),
} = {}) {
  const targetKey = promptDate || localDayKey(now);
  const eligible = (sharedPhotos || []).filter((photo) => localDayKey(new Date(photoTime(photo))) === targetKey);
  if (!eligible.length) return null;
  return bestPhoto(eligible);
}

function canSharePresentationGroup(a, b, fallbackGapMs) {
  if (!isPhotoOnly(a) || !isPhotoOnly(b)) return false;
  if (a?.moment?.id && a.moment.id === b?.moment?.id) return true;
  if (hasParentContext(a) || hasParentContext(b)) return false;
  return Math.abs(recordTime(a) - recordTime(b)) <= fallbackGapMs;
}

function bestRecord(records) {
  return [...records].sort((a, b) =>
    Number(hasParentContext(b)) - Number(hasParentContext(a))
      || recordQuality(b) - recordQuality(a)
      || recordTime(b) - recordTime(a)
      || String(a?.key || '').localeCompare(String(b?.key || '')),
  )[0];
}

function bestPhoto(photos) {
  return [...photos].sort((a, b) =>
    photoQuality(b) - photoQuality(a)
      || photoTime(b) - photoTime(a)
      || String(a?.asset_id || '').localeCompare(String(b?.asset_id || '')),
  )[0];
}

function recordQuality(record) {
  const media = record?.moment?.media?.[0] || record?.photo?.moment_media || record?.photo || {};
  return qualityValue({
    captureQuality: media?.metadata?.captureQuality ?? media?.captureQuality,
    sharpness: media?.metadata?.sharpness ?? media?.sharpness,
    faceSizeRatio: media?.metadata?.faceSizeRatio ?? media?.faceSizeRatio,
  });
}

function photoQuality(photo) {
  const media = Array.isArray(photo?.moment_media) ? photo.moment_media[0] : photo?.moment_media;
  return qualityValue({
    captureQuality: media?.metadata?.captureQuality ?? photo?.metadata?.captureQuality,
    sharpness: media?.metadata?.sharpness ?? photo?.metadata?.sharpness,
    faceSizeRatio: media?.metadata?.faceSizeRatio ?? photo?.metadata?.faceSizeRatio,
  });
}

function hasParentContext(record) {
  const moment = record?.moment;
  return !!String(moment?.title || moment?.caption_note || '').trim()
    || (record?.tags || []).some((tag) => !['photo', 'auto-saved', 'assistant'].includes(String(tag).toLowerCase()));
}

function isPhotoOnly(record) {
  return Number(record?.imageCount || 0) > 0
    && Number(record?.videoCount || 0) === 0
    && Number(record?.voiceCount || 0) === 0;
}

function recordTime(record) {
  return timestamp(record?.capturedAt || record?.moment?.captured_at || record?.photo?.creation_time);
}

function photoTime(photo) {
  return timestamp(photo?.creation_time || photo?.created_at || photo?.tagged_at);
}

function timestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function localDayKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

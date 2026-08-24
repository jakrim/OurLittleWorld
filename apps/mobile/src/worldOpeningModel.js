export function selectWorldOpening(records = [], membersById = {}) {
  const visualRecords = (records || [])
    .map((record) => worldVisualRecord(record, membersById))
    .filter(Boolean);
  return {
    primary: visualRecords[0] || null,
    continuity: visualRecords.slice(1, 4),
    visualCount: visualRecords.length,
  };
}

function worldVisualRecord(record, membersById) {
  const media = record?.moment?.media || [];
  const first = media.find((item) => worldImageUri(item)) || null;
  const hasVideo = media.some((item) => item?.media_type === 'video') || Number(record?.videoCount || 0) > 0;
  const mediaUri = worldImageUri(first) || (!hasVideo ? record?.thumbUrl || null : null);
  if (!record || !mediaUri) return null;
  const authorId = record.moment?.author_user_id
    || record.photo?.asset_owner_user_id
    || record.photo?.user_id
    || null;
  return {
    record,
    mediaUri,
    mediaType: first?.media_type || (record.videoCount ? 'video' : 'image'),
    capturedAt: safeDate(record.capturedAt),
    author: authorId ? membersById[authorId] || null : null,
  };
}

function worldImageUri(media) {
  if (!media) return null;
  if (media.media_type === 'video') return media.posterUrl || media.thumbUrl || null;
  return media.thumbUrl || media.fullUrl || media.posterUrl || null;
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

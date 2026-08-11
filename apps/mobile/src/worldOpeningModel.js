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
  const first = media.find((item) => item?.thumbUrl || item?.posterUrl || item?.fullUrl) || null;
  const mediaUri = first?.fullUrl || first?.thumbUrl || first?.posterUrl || record?.thumbUrl || null;
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

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

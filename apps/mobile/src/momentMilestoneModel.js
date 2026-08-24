export function buildMomentMilestoneRoute({ moment, existingFirst = null, media = null } = {}) {
  if (!moment?.id) return null;
  const seedDate = localDateOnly(moment.captured_at || moment.capturedAt);
  const params = compactParams({
    id: existingFirst?.id,
    momentId: moment.id,
    sourceMomentId: moment.id,
    title: existingFirst ? null : moment.title,
    seedNote: existingFirst ? null : moment.caption_note,
    seedDate,
    seedAssetId: media?.local_identifier,
    seedAssetOwnerUserId: media?.owner_user_id,
    seedAssetUri: media?.fullUrl || media?.thumbUrl || media?.posterUrl,
  });
  return { pathname: '/first-compose', params };
}

export function shouldLockMilestoneDate({ sourceMomentId, happenedDate } = {}) {
  return Boolean(String(sourceMomentId || '').trim() && localDateOnly(happenedDate));
}

export function milestoneDateSourceCaption({ ageCaption } = {}) {
  return ['Date from this saved moment.', String(ageCaption || '').trim()].filter(Boolean).join(' ');
}

function localDateOnly(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function compactParams(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null && value !== undefined && value !== ''),
  );
}

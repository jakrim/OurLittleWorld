// Pure model logic for the Today milestone teaser. No React Native imports.

function mediaKey(row) {
  if (!row?.asset_owner_user_id || !row?.asset_id) return null;
  return `${row.asset_owner_user_id}:${row.asset_id}`;
}

export function photoForFirst(first, sharedPhotos = []) {
  const key = mediaKey(first);
  if (!key) return null;
  return (sharedPhotos || []).find((photo) => mediaKey(photo) === key) || null;
}

export function buildFirstsSummary(firsts = [], sharedPhotos = []) {
  const completed = (firsts || []).filter((first) => first && first.done !== false);
  const latest = completed[0] || null;
  return {
    count: completed.length,
    latest,
    latestPhoto: photoForFirst(latest, sharedPhotos),
  };
}

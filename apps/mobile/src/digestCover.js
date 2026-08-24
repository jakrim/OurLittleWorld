// Digest cover fallback chain (B2): digest cover photo → the latest milestone's
// attached photo → any recent shared photo → null (caller hides the cover block).
// No React Native imports — unit-tested with node --test.

function uriOf(photo) {
  return photo?.thumbUrl || photo?.fullUrl || null;
}

export function pickDigestCoverUri({ coverPhoto, latestFirst, sharedPhotos = [] }) {
  const direct = uriOf(coverPhoto);
  if (direct) return direct;
  if (latestFirst?.asset_owner_user_id && latestFirst?.asset_id) {
    const key = `${latestFirst.asset_owner_user_id}:${latestFirst.asset_id}`;
    const match = sharedPhotos.find((photo) => `${photo.asset_owner_user_id}:${photo.asset_id}` === key);
    const matchUri = uriOf(match);
    if (matchUri) return matchUri;
  }
  for (const photo of sharedPhotos) {
    const fallback = uriOf(photo);
    if (fallback) return fallback;
  }
  return null;
}

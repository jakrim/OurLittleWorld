export function digestHasContent(digest) {
  const moments = Number(digest?.momentCount ?? digest?.photoCount ?? 0);
  const milestones = Number(digest?.milestoneCount ?? digest?.firstsCount ?? 0);
  const voice = Number(digest?.voiceNoteCount || 0);
  const letters = Number(digest?.letterCount || 0);
  return moments + milestones + voice + letters > 0;
}

export function distinctDigestRepresentativeMedia(media = [], { limit = 4 } = {}) {
  const seenMoments = new Set();
  const seenMedia = new Set();
  const out = [];
  for (const item of media || []) {
    const momentId = item?.momentId || item?.moment_id || null;
    const mediaId = item?.mediaId || item?.media_id || null;
    if (momentId && seenMoments.has(momentId)) continue;
    if (!momentId && mediaId && seenMedia.has(mediaId)) continue;
    if (momentId) seenMoments.add(momentId);
    if (mediaId) seenMedia.add(mediaId);
    out.push(item);
    if (out.length >= Math.max(0, Number(limit || 0))) break;
  }
  return out;
}

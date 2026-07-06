export function digestHasContent(digest) {
  const moments = Number(digest?.momentCount ?? digest?.photoCount ?? 0);
  const milestones = Number(digest?.milestoneCount ?? digest?.firstsCount ?? 0);
  const voice = Number(digest?.voiceNoteCount || 0);
  const letters = Number(digest?.letterCount || 0);
  return moments + milestones + voice + letters > 0;
}

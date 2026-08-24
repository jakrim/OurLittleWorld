// Prompt starter (V1). A starter line for the daily prompt drawn from what was
// actually saved today — counts and time of day only, never invented detail.
// Empty when nothing was saved today: no filler. No React Native imports —
// unit-tested with node --test.

export const PROMPT_STARTER_BUTTON_LABEL = "Start from today's moments";

export function promptStarterForToday({ sharedPhotos = [], now = new Date() } = {}) {
  const reference = new Date(now);
  const todayPhotos = (sharedPhotos || []).filter((photo) => {
    const time = photo?.creation_time ? new Date(photo.creation_time) : null;
    return time && !Number.isNaN(time.getTime()) && isSameLocalDay(time, reference);
  });
  if (!todayPhotos.length) return '';

  const latest = todayPhotos.reduce((best, photo) => (
    new Date(photo.creation_time).getTime() > new Date(best.creation_time).getTime() ? photo : best
  ));
  const phrase = timeOfDayPhrase(new Date(latest.creation_time).getHours());
  if (todayPhotos.length === 1) {
    return `Today we saved one moment, from ${phrase}.`;
  }
  return `Today we saved ${todayPhotos.length} moments — one from ${phrase}.`;
}

function timeOfDayPhrase(hour) {
  if (hour < 11) return 'this morning';
  if (hour < 17) return 'this afternoon';
  return 'this evening';
}

function isSameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

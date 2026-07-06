export const AUTO_SAVE_CAPTURE_QUALITY_FLOOR = 0.25;

export function shouldAutoSaveMatch(match, { scoreThreshold } = {}) {
  const score = Number(match?.score || 0);
  if (Number.isFinite(scoreThreshold) && score < scoreThreshold) return false;
  const captureQuality = Number(match?.captureQuality);
  if (Number.isFinite(captureQuality) && captureQuality < AUTO_SAVE_CAPTURE_QUALITY_FLOOR) {
    return false;
  }
  return true;
}

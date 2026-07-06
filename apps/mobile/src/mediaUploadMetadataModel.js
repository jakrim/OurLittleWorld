// Upload-metadata shape (W1). Quality signals computed during the scan ride
// along into `moment_media.metadata` (jsonb, no migration) so the weekly
// digest — and later the photo book — can rank media by quality instead of
// recency alone. Keys are added only when the scan actually produced them.
// No React Native imports — unit-tested with node --test.

export function mediaUploadMetadata(base = {}, match = null) {
  const out = { ...base };
  if (!match) return out;
  const captureQuality = finiteOrNull(match.captureQuality);
  const recognitionScore = finiteOrNull(match.score);
  const faceCount = finiteOrNull(match.faceCount);
  if (captureQuality != null) out.captureQuality = captureQuality;
  if (recognitionScore != null) out.recognitionScore = recognitionScore;
  if (faceCount != null) out.faceCount = faceCount;
  return out;
}

function finiteOrNull(value) {
  if (value == null || value === '') return null; // Number(null) is 0 — not a real signal
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

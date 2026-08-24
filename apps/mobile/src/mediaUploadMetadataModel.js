// Shared upload metadata is deliberately limited to non-identity facts about
// the parent-approved media. Candidate reasons, recognition scores, face
// counts, frame-presence evidence, fingerprints and local identifiers remain
// in the private on-device ledger even after Keep.
// No React Native imports — unit-tested with node --test.

export function mediaUploadMetadata(base = {}, match = null) {
  const out = withoutPrivateFields(base);
  if (!match) return out;
  const captureQuality = finiteOrNull(match.captureQuality);
  if (captureQuality != null) out.captureQuality = captureQuality;
  return out;
}

// A video poster's frame time/source is recognition evidence when the frame
// came from a face-match candidate; that provenance must never reach shared
// metadata, even though the same fields are safe to share for a poster the
// app generated on its own (no recognition input).
export function sharedPosterProvenance(poster) {
  if (poster?.source === 'recognition-frame') return {};
  return { posterTimeMs: poster?.timeMs ?? null, posterSource: poster?.source ?? null };
}

const PRIVATE_METADATA_KEYS = new Set([
  'assetId',
  'localAssetId',
  'pickerAssetId',
  'recognitionCandidateId',
  'recognitionScore',
  'faceCount',
  'videoPresenceRatio',
  'videoSampledFrames',
  'videoMatchedFrames',
  'recognitionFrameTimeMs',
  'curationDay',
  'curationRole',
  'curationReason',
  'visualFingerprint',
  'identityEvidence',
]);

function withoutPrivateFields(base) {
  const safe = {};
  for (const [key, value] of Object.entries(base || {})) {
    if (!PRIVATE_METADATA_KEYS.has(key) && value !== undefined) safe[key] = value;
  }
  return safe;
}

function finiteOrNull(value) {
  if (value == null || value === '') return null; // Number(null) is 0 — not a real signal
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

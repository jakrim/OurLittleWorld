// Shared upload metadata is deliberately limited to non-identity facts about
// the parent-approved media. Candidate reasons, recognition scores, face
// counts, frame-presence evidence, fingerprints and local identifiers remain
// in the private on-device ledger even after Keep.
// No React Native imports — unit-tested with node --test.

export const SHARED_MEDIA_METADATA_KEYS = new Set([
  'source',
  'fullPath',
  'thumbPath',
  'posterPath',
  'posterTimeMs',
  'posterWidth',
  'posterHeight',
  'posterSource',
  'posterStatus',
  'posterErrorCode',
  'posterOnly',
  'sourceDurationSec',
  'originalFileName',
  'fileSize',
  'captureQuality',
  'localAssetDeletedAt',
  'localAssetStatus',
]);

export function mediaUploadMetadata(base = {}, match = null) {
  const out = {};
  for (const [key, value] of Object.entries(base || {})) {
    if (value === undefined) continue;
    if (!SHARED_MEDIA_METADATA_KEYS.has(key)) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(`[mediaUploadMetadata] dropped unknown key: ${key}`);
      }
      continue;
    }
    out[key] = value;
  }
  if (!match) return out;
  const captureQuality = finiteOrNull(match.captureQuality);
  if (captureQuality != null) out.captureQuality = captureQuality;
  return out;
}

export function classifyPosterErrorCode(error) {
  const message = String(error?.message || error).toLowerCase();
  if (/timeout|timed out|time out/.test(message)) return 'timeout';
  if (/permission|unauthorized|forbidden|access denied/.test(message)) return 'permission';
  if (/not found|no such file|does not exist|missing/.test(message)) return 'not_found';
  if (/decode|decoder|invalid data|corrupt|unsupported format/.test(message)) return 'decode_failed';
  if (/network|offline|connection|fetch|socket|http/.test(message)) return 'network';
  if (/storage|upload|disk|file ?system|quota|no space/.test(message)) return 'storage';
  return 'unknown';
}

function finiteOrNull(value) {
  if (value == null || value === '') return null; // Number(null) is 0 — not a real signal
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

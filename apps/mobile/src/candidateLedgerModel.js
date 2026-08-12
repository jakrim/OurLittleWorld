import { curationDayKey } from './dailyCurationModel.js';
import { qualityValue } from './photoStackModel.js';
import { localDayInTimeZone } from './firstYearCatchupModel.js';

export const CANDIDATE_SCORER_VERSION = 'curated-ledger-v1';
export const CANDIDATE_BATCH_SIZE = 80;
export const CANDIDATE_LIVE_MATCH_LIMIT = 600;

export const CANDIDATE_STATES = Object.freeze([
  'discovered',
  'eligible',
  'queued',
  'shown',
  'kept',
  'skipped',
  'unavailable',
  'rejected',
  'superseded',
]);

export const FINAL_PARENT_DECISION_STATES = Object.freeze(['kept', 'skipped']);
export const PRESERVE_CANDIDATE_LIFECYCLE_ON_ANALYSIS_SQL = `case
  when discovery_candidates.lifecycle_state in ('kept','skipped','queued','shown')
    then discovery_candidates.lifecycle_state
  else excluded.lifecycle_state
end`;

export const SELECTION_REASONS = Object.freeze({
  best_day: 'A clear photo from this day',
  best_burst: 'A clear pick from similar photos',
  distinct_standout: 'A different moment from this day',
  clear_video: 'A clear video from this day',
  first_year_coverage: 'A day from the first year',
  parent_pick: 'Chosen by you',
});

export function normalizeDiscoveryCandidate(match, {
  scanKey,
  now = new Date(),
  minIdentityScore = 0.75,
  scorerVersion = CANDIDATE_SCORER_VERSION,
  birthdayISO = null,
  captureTimezone = resolvedTimeZone(),
} = {}) {
  const assetId = String(match?.assetId || match?.asset_id || '').trim();
  if (!assetId) return null;
  const captureTimeMs = candidateTime(match?.creationTime ?? match?.creation_time);
  const identityScore = finiteOrNull(match?.score);
  const mediaType = match?.mediaType === 'video' ? 'video' : 'image';
  const localUri = mediaType === 'video'
    ? match?.videoUri || match?.localUri || match?.uri || null
    : match?.localUri || match?.uri || null;
  const previewUri = mediaType === 'video'
    ? match?.previewUri || (match?.videoUri ? match?.uri : null) || null
    : match?.previewUri || match?.uri || match?.localUri || null;
  const availability = match?.availability === 'icloud_pending' || match?.availability === 'unavailable'
    ? match.availability
    : 'available';
  const eligible = availability === 'available'
    && identityScore != null
    && identityScore >= minIdentityScore
    && !!curationDayKey(captureTimeMs);
  const clusterKey = eventClusterKey({ assetId, captureTimeMs, mediaType });
  const stamp = now.toISOString();

  return {
    assetId,
    mediaType,
    localUri,
    previewUri,
    availability,
    captureTimeMs: captureTimeMs || null,
    localDay: captureTimeMs ? localDayInTimeZone(captureTimeMs, captureTimezone) : null,
    captureTimezone,
    width: integerOrNull(match?.width),
    height: integerOrNull(match?.height),
    durationSec: normalizedDurationSec(match?.duration ?? match?.durationSec),
    identityScore,
    identityBand: eligible ? 'clear' : 'uncertain',
    faceCount: integerOrNull(match?.faceCount),
    captureQuality: finiteOrNull(match?.captureQuality),
    faceSizeRatio: finiteOrNull(match?.faceSizeRatio),
    sharpness: finiteOrNull(match?.sharpness),
    smileScore: finiteOrNull(match?.smileScore ?? match?.likelySmileScore),
    videoPresenceRatio: finiteOrNull(match?.videoPresenceRatio),
    videoSampledFrames: integerOrNull(match?.videoSampledFrames),
    videoMatchedFrames: integerOrNull(match?.videoMatchedFrames),
    visualFingerprintJson: privateEvidenceJson(match?.visualFingerprint),
    identityEvidenceJson: privateEvidenceJson({
      score: identityScore,
      faceCount: integerOrNull(match?.faceCount),
      candidateId: match?.candidateId || null,
    }),
    eventClusterKey: clusterKey,
    representativeAssetId: assetId,
    clusterMemberCount: 1,
    scorerVersion,
    selectionReasonCode: initialReasonCode(match, mediaType, captureTimeMs, birthdayISO),
    lifecycleState: availability === 'available' ? (eligible ? 'eligible' : 'rejected') : 'unavailable',
    scanKey: scanKey || null,
    lastSeenScanKey: scanKey || null,
    firstSeenAt: stamp,
    lastSeenAt: stamp,
    lastAnalyzedAt: stamp,
    unavailableReason: match?.unavailableReason || null,
    unavailableCode: availability === 'icloud_pending' ? 'icloud_pending' : null,
    qualityScore: qualityValue(match),
  };
}

export function buildCandidateClusters(candidates = []) {
  const groups = new Map();
  for (const candidate of candidates || []) {
    if (!candidate?.assetId || !candidate?.eventClusterKey) continue;
    if (!groups.has(candidate.eventClusterKey)) groups.set(candidate.eventClusterKey, []);
    groups.get(candidate.eventClusterKey).push(candidate);
  }
  return [...groups.entries()].map(([clusterId, members]) => {
    const ranked = [...members].sort(compareCandidateStrength);
    return {
      clusterId,
      representativeAssetId: ranked[0].assetId,
      memberCount: ranked.length,
      clusterKind: ranked[0].mediaType === 'video' ? 'video' : ranked.length > 1 ? 'burst' : 'event',
      members: ranked.map((candidate, index) => ({
        assetId: candidate.assetId,
        isRepresentative: index === 0,
      })),
    };
  });
}

export function compareCandidateStrength(a, b) {
  return Number(b?.captureQuality || b?.qualityScore || 0) - Number(a?.captureQuality || a?.qualityScore || 0)
    || Number(b?.identityScore || 0) - Number(a?.identityScore || 0)
    || Number(b?.videoPresenceRatio || 0) - Number(a?.videoPresenceRatio || 0)
    || Number(b?.captureTimeMs || 0) - Number(a?.captureTimeMs || 0)
    || String(a?.assetId || '').localeCompare(String(b?.assetId || ''));
}

export function isFinalParentDecision(state) {
  return FINAL_PARENT_DECISION_STATES.includes(state);
}

export function canAccessPrivateDiscovery({ role, entitlementActive }) {
  return entitlementActive === true && ['creator', 'partner'].includes(role);
}

function initialReasonCode(match, mediaType, captureTimeMs, birthdayISO) {
  if (match?.parentPinned || match?.pinned) return 'parent_pick';
  if (mediaType === 'video') return 'clear_video';
  if (isFirstYearCapture(captureTimeMs, birthdayISO)) return 'first_year_coverage';
  return 'best_day';
}

function isFirstYearCapture(captureTimeMs, birthdayISO) {
  if (!captureTimeMs || !/^\d{4}-\d{2}-\d{2}$/.test(String(birthdayISO || ''))) return false;
  const [year, month, day] = birthdayISO.split('-').map(Number);
  const birth = new Date(year, month - 1, day, 0, 0, 0, 0);
  const firstBirthday = new Date(year + 1, month - 1, day, 0, 0, 0, 0);
  return captureTimeMs >= birth.getTime() && captureTimeMs < firstBirthday.getTime();
}

function eventClusterKey({ assetId, captureTimeMs, mediaType }) {
  if (!captureTimeMs) return `${mediaType}:unknown:${assetId}`;
  const windowMs = mediaType === 'video' ? 30 * 60 * 1000 : 3 * 1000;
  return `${mediaType}:${Math.floor(captureTimeMs / windowMs)}`;
}

function candidateTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedDurationSec(value) {
  const number = finiteOrNull(value);
  if (number == null) return null;
  return number > 1000 ? number / 1000 : number;
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value) {
  const number = finiteOrNull(value);
  return number == null ? null : Math.round(number);
}

function privateEvidenceJson(value) {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function resolvedTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

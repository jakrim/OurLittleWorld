import { AUTO_SAVE_MEDIA_SOURCE } from './autoSaveCorrectionModel.js';
import { hasEarnedAutoSaveTrust, TRUST_AUTO_SAVE_THRESHOLD } from './photoIngestionTrustModel.js';
import { shouldAutoSaveMatch } from './scanQualityModel.js';

export const SCAN_AUTO_SAVE_SOURCE = AUTO_SAVE_MEDIA_SOURCE;

export function buildScanAutoSaveGate({
  calibration = null,
  hasDeviceReference = true,
} = {}) {
  const configuredEnabled = !!(calibration?.autoSaveEnabled || calibration?.auto_save_enabled);
  const trustEarned = !!hasDeviceReference && hasEarnedAutoSaveTrust(calibration || {});
  const storedThreshold = Number(
    calibration?.autoSaveThreshold
      ?? calibration?.auto_save_threshold
      ?? TRUST_AUTO_SAVE_THRESHOLD,
  );
  const threshold = Number.isFinite(storedThreshold) ? storedThreshold : TRUST_AUTO_SAVE_THRESHOLD;
  let reason = null;
  if (!hasDeviceReference) {
    reason = 'missing-device-reference';
  } else if (!trustEarned) {
    reason = 'trust-not-earned';
  } else if (!configuredEnabled) {
    reason = 'review-first-selected';
  }
  return {
    enabled: configuredEnabled && trustEarned,
    configuredEnabled,
    trustEarned,
    threshold,
    reason,
    source: SCAN_AUTO_SAVE_SOURCE,
  };
}

export function selectScanAutoSaveMatches(matches = [], {
  enabled = true,
  scoreThreshold = TRUST_AUTO_SAVE_THRESHOLD,
  seenAssetIds = null,
} = {}) {
  if (!enabled) return [];
  const seen = seenAssetIds instanceof Set
    ? seenAssetIds
    : new Set(Array.isArray(seenAssetIds) ? seenAssetIds : []);
  const selected = [];
  for (const match of Array.isArray(matches) ? matches : []) {
    if (!match?.assetId || seen.has(match.assetId)) continue;
    if (!shouldAutoSaveMatch(match, { scoreThreshold })) continue;
    selected.push(match);
  }
  return selected;
}

export function splitScanMatchesForAutoSave(matches = [], options = {}) {
  const autoSaveMatches = selectScanAutoSaveMatches(matches, options);
  const autoSaveIds = new Set(autoSaveMatches.map((match) => match.assetId));
  const reviewMatches = (Array.isArray(matches) ? matches : [])
    .filter((match) => !autoSaveIds.has(match?.assetId));
  return { autoSaveMatches, reviewMatches };
}

export function buildScanAutoSaveRuntimePlan({
  matches = [],
  calibration = null,
  hasDeviceReference = true,
  seenAssetIds = null,
} = {}) {
  const gate = buildScanAutoSaveGate({ calibration, hasDeviceReference });
  return {
    ...gate,
    ...splitScanMatchesForAutoSave(matches, {
      enabled: gate.enabled,
      scoreThreshold: gate.threshold,
      seenAssetIds,
    }),
  };
}

import { AUTO_SAVE_CORRECTION_REVIEW_THRESHOLD } from './autoSaveCorrectionModel.js';
import { childScopeContext } from './childScopeModel.js';
import { AUTO_SAVE_CAPTURE_QUALITY_FLOOR } from './scanQualityModel.js';

export const TRUST_CLEAN_BATCH_MIN = 5;
export const TRUST_SMALL_BATCH_MAX = 2;
export const TRUST_CORRECTION_REVIEW_MIN = AUTO_SAVE_CORRECTION_REVIEW_THRESHOLD;
export const TRUST_HIGH_CONFIDENCE_SCORE = 0.75;
export const TRUST_AUTO_SAVE_THRESHOLD = 0.9;
export const TRUST_CAPTURE_QUALITY_FLOOR = AUTO_SAVE_CAPTURE_QUALITY_FLOOR;
export const AUTO_SAVE_MODE_REVIEW_FIRST = 'review_first';
export const AUTO_SAVE_MODE_AUTO = 'auto_save_clear_matches';

// Internal assistant thresholds. These are returned for diagnostics/tests, but
// parent-facing copy must stay qualitative.
export function buildPhotoIngestionTrustModel({
  calibration = null,
  recentAutoSaves = [],
  pendingReviewCount = 0,
  autoSaveErrors = 0,
  corrections = null,
  negativeExamples = null,
  hasDeviceReference = true,
  babyName = null,
  childId = null,
} = {}) {
  const scope = childScopeContext(childId ?? calibration?.childId ?? calibration?.child_id);
  const normalizedCorrections = Array.isArray(corrections)
    ? corrections
    : Array.isArray(calibration?.corrections) ? calibration.corrections : [];
  const normalizedNegatives = Array.isArray(negativeExamples)
    ? negativeExamples
    : Array.isArray(calibration?.negativeExamples) ? calibration.negativeExamples
      : Array.isArray(calibration?.negative_examples) ? calibration.negative_examples : [];
  const pending = Math.max(0, Number(pendingReviewCount || 0));
  const recent = Array.isArray(recentAutoSaves) ? recentAutoSaves.filter(Boolean) : [];
  const removedAutoSaves = normalizedNegatives.filter((item) => itemVerdict(item) === 'removed').length
    + normalizedCorrections.filter((item) => itemVerdict(item) === 'removed').length;
  const autoSaveTrustEarned = hasEarnedAutoSaveTrust({
    ...calibration,
    corrections: normalizedCorrections,
    negativeExamples: normalizedNegatives,
  });
  const autoSaveEnabled = false;
  const hasReviewHistory = normalizedCorrections.length > 0
    || !!(calibration?.calibratedAt ?? calibration?.calibrated_at);
  const autoSaveThreshold = Number(calibration?.autoSaveThreshold ?? calibration?.auto_save_threshold ?? TRUST_AUTO_SAVE_THRESHOLD);

  let state = 'review_required';
  if (!hasDeviceReference) {
    state = 'review_required';
  } else if (autoSaveErrors > 0 || removedAutoSaves >= TRUST_CORRECTION_REVIEW_MIN) {
    state = 'needs_correction_review';
  } else if (autoSaveTrustEarned) {
    state = 'auto_save_ready';
  } else if (hasReviewHistory) {
    state = 'learning';
  }

  const copy = copyForState({ state, pending, recentCount: recent.length, babyName, hasDeviceReference });
  const route = routeForState({ state, pending, recentCount: recent.length });
  const model = {
    ...scope,
    referenceScope: scope.childScoped
      ? { kind: 'child', childId: scope.childId }
      : { kind: 'family' },
    state,
    pendingReviewCount: pending,
    recentAutoSaveCount: recent.length,
    autoSaveErrors: Number(autoSaveErrors || 0),
    correctionCount: normalizedCorrections.length,
    removedAutoSaveCount: removedAutoSaves,
    autoSaveTrustEarned,
    autoSaveEnabled: autoSaveEnabled && autoSaveTrustEarned,
    autoSavePreference: AUTO_SAVE_MODE_REVIEW_FIRST,
    title: copy.title,
    body: copy.body,
    actionLabel: copy.actionLabel,
    route,
    autoSaveSetting: buildAutoSaveSettingModel({
      state,
      trustEarned: autoSaveTrustEarned,
      enabled: autoSaveEnabled && autoSaveTrustEarned,
      configuredEnabled: false,
      hasDeviceReference,
    }),
    tunables: {
      cleanBatchMin: TRUST_CLEAN_BATCH_MIN,
      smallBatchMax: TRUST_SMALL_BATCH_MAX,
      highConfidenceScore: TRUST_HIGH_CONFIDENCE_SCORE,
      autoSaveThreshold,
      captureQualityFloor: TRUST_CAPTURE_QUALITY_FLOOR,
    },
  };
  return {
    ...model,
    todayNudge: todayNudgeForModel(model),
    bookAlert: model,
  };
}

function todayNudgeForModel(model) {
  if (model.state === 'review_required' && !model.pendingReviewCount && !model.autoSaveErrors && !model.correctionCount) return null;
  if (model.state === 'learning' && !model.pendingReviewCount) return null;
  if (model.state === 'auto_save_ready' && !model.pendingReviewCount) return null;
  if (model.state === 'auto_save_active' && !model.recentAutoSaveCount && !model.autoSaveErrors) return null;
  return {
    kind: 'photo-trust',
    trustState: model.state,
    eyebrow: 'Photo assistant',
    title: model.title,
    route: model.route,
  };
}

function copyForState({ state, pending, recentCount, babyName, hasDeviceReference }) {
  const child = babyName || 'your little one';
  if (!hasDeviceReference) {
    return {
      title: 'Review starts on this device',
      body: `Confirm likely photos of ${child} here before this device can save clear matches.`,
      actionLabel: 'Start review',
    };
  }
  if (state === 'needs_correction_review') {
    return {
      title: 'Auto-save needs a quick review',
      body: 'A correction or save issue paused automatic saving until a parent reviews what happened.',
      actionLabel: 'Review photos',
    };
  }
  if (state === 'auto_save_active') {
    return {
      title: recentCount
        ? `${recentCount} clear ${recentCount === 1 ? 'match was' : 'matches were'} added by the assistant`
        : 'Assistant can save clear matches',
      body: 'Clear matches can save automatically after parent review has built trust.',
      actionLabel: recentCount ? 'Review recent saves' : 'Open Our World',
    };
  }
  if (state === 'auto_save_ready') {
    return {
      title: pending ? `${pending} likely ${pending === 1 ? 'photo is' : 'photos are'} ready` : 'Likely photos are ready for review',
      body: 'Each suggestion stays private on this device until a parent reviews it and taps Keep.',
      actionLabel: pending ? 'Review photos' : 'Start scan',
    };
  }
  if (state === 'learning') {
    return {
      title: pending ? `${pending} likely ${pending === 1 ? 'photo is' : 'photos are'} worth a look` : 'Review is building trust',
      body: 'A few parent choices help the assistant understand what belongs before automatic saving.',
      actionLabel: pending ? 'Review photos' : 'Start scan',
    };
  }
  return {
    title: pending ? `${pending} likely ${pending === 1 ? 'photo is' : 'photos are'} worth a look` : 'Review likely photos first',
    body: 'First review builds trust before clear matches can save automatically.',
    actionLabel: pending ? 'Review photos' : 'Start review',
  };
}

function routeForState({ state, pending, recentCount }) {
  if (state === 'auto_save_active' && recentCount) return '/library';
  if (state === 'auto_save_active') return '/library';
  if (state === 'auto_save_ready' && pending <= 0) return '/library';
  if (pending > 0) return '/review';
  return '/scan';
}

export function hasEarnedAutoSaveTrust(calibration = {}) {
  const corrections = Array.isArray(calibration?.corrections) ? calibration.corrections : [];
  const negativeExamples = Array.isArray(calibration?.negativeExamples ?? calibration?.negative_examples)
    ? (calibration.negativeExamples ?? calibration.negative_examples)
    : [];
  const acceptedHigh = corrections.filter((item) => itemIsHigh(item) && itemVerdict(item) === 'keep').length;
  const rejectedHigh = corrections.filter((item) => itemIsHigh(item) && ['skip', 'removed'].includes(itemVerdict(item))).length;
  const removedAutoSaves = negativeExamples.filter((item) => itemVerdict(item) === 'removed').length
    + corrections.filter((item) => itemVerdict(item) === 'removed').length;
  return acceptedHigh >= TRUST_CLEAN_BATCH_MIN && rejectedHigh === 0 && removedAutoSaves === 0;
}

export function buildAutoSaveSettingModel({
  state,
  trustEarned,
  enabled,
  configuredEnabled,
  hasDeviceReference = true,
} = {}) {
  const value = AUTO_SAVE_MODE_REVIEW_FIRST;
  const available = false;
  const options = [
    { value: AUTO_SAVE_MODE_REVIEW_FIRST, label: 'Review first' },
  ];

  if (available) {
    return {
      available: true,
      value,
      configuredValue: configuredEnabled ? AUTO_SAVE_MODE_AUTO : AUTO_SAVE_MODE_REVIEW_FIRST,
      options,
      title: 'Photo saving',
      body: enabled
        ? 'Auto-save clear matches is on. Future scans still use the same review setting and low-quality matches still wait for review.'
        : 'Review first is selected. Saved memories stay in Our World; clear matches wait for review until you turn on auto-save.',
      footnote: 'Changing this setting never deletes saved memories or Photos originals.',
    };
  }

  return {
    available: false,
    value: AUTO_SAVE_MODE_REVIEW_FIRST,
    configuredValue: AUTO_SAVE_MODE_REVIEW_FIRST,
    options,
    title: 'Photo saving',
    body: hasDeviceReference
      ? 'Likely photos wait on this device until a parent reviews each one and taps Keep.'
      : 'This device needs a confirmed photo reference before it can suggest photos for review.',
    footnote: 'Only an explicit parent Keep creates a shared memory. Photos originals are never deleted.',
  };
}

function itemIsHigh(item) {
  return Number(item?.score || 0) >= TRUST_HIGH_CONFIDENCE_SCORE;
}

function itemVerdict(item) {
  return String(item?.verdict || '').toLowerCase();
}

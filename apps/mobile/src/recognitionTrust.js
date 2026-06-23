import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

export const REVIEW_THRESHOLD = 0.65;
export const HIGH_CONFIDENCE_THRESHOLD = 0.75;
export const DEFAULT_AUTO_SAVE_THRESHOLD = 0.9;

const VERSION = 'v1';
const RECENT_AUTO_SAVE_LIMIT = 40;

export function calibrationStorageKey({ familyId, userId }) {
  return `olw:media-import-calibration:${VERSION}:${familyId}:${userId}`;
}

export function recentAutoSavesStorageKey({ familyId, userId }) {
  return `olw:media-import-recent-auto-saves:${VERSION}:${familyId}:${userId}`;
}

function normalizeCalibration(raw) {
  return {
    autoSaveEnabled: !!(raw?.autoSaveEnabled ?? raw?.auto_save_enabled),
    autoSaveThreshold: Number(raw?.autoSaveThreshold ?? raw?.auto_save_threshold ?? DEFAULT_AUTO_SAVE_THRESHOLD),
    batchReviewMin: Number(raw?.batchReviewMin ?? raw?.batch_review_min ?? REVIEW_THRESHOLD),
    calibratedAt: raw?.calibratedAt ?? raw?.calibrated_at ?? null,
    corrections: Array.isArray(raw?.corrections) ? raw.corrections : [],
    negativeExamples: Array.isArray(raw?.negativeExamples ?? raw?.negative_examples)
      ? (raw.negativeExamples ?? raw.negative_examples)
      : [],
  };
}

async function readLocalCalibration({ familyId, userId }) {
  if (!familyId || !userId) return normalizeCalibration(null);
  const raw = await AsyncStorage.getItem(calibrationStorageKey({ familyId, userId }));
  if (!raw) return normalizeCalibration(null);
  try {
    return normalizeCalibration(JSON.parse(raw));
  } catch {
    return normalizeCalibration(null);
  }
}

async function writeLocalCalibration({ familyId, userId, calibration }) {
  if (!familyId || !userId) return;
  await AsyncStorage.setItem(
    calibrationStorageKey({ familyId, userId }),
    JSON.stringify(normalizeCalibration(calibration)),
  );
}

export async function getImportCalibration({ familyId, userId }) {
  const local = await readLocalCalibration({ familyId, userId });
  if (!familyId || !userId) return local;

  try {
    const { data, error } = await supabase
      .from('media_import_calibrations')
      .select('auto_save_enabled, auto_save_threshold, batch_review_min, calibrated_at, corrections, negative_examples')
      .eq('family_id', familyId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return local;
    const remote = normalizeCalibration(data);
    await writeLocalCalibration({ familyId, userId, calibration: remote });
    return remote;
  } catch {
    return local;
  }
}

async function saveImportCalibration({ familyId, userId, calibration }) {
  const next = normalizeCalibration(calibration);
  await writeLocalCalibration({ familyId, userId, calibration: next });
  if (!familyId || !userId) return next;

  try {
    await supabase.from('media_import_calibrations').upsert(
      {
        family_id: familyId,
        user_id: userId,
        auto_save_enabled: next.autoSaveEnabled,
        auto_save_threshold: next.autoSaveThreshold,
        batch_review_min: next.batchReviewMin,
        calibrated_at: next.calibratedAt,
        corrections: next.corrections,
        negative_examples: next.negativeExamples,
      },
      { onConflict: 'family_id,user_id' },
    );
  } catch {
    // Local trust state is enough for device-side scan behavior.
  }

  return next;
}

function compactMatch(match, verdict) {
  return {
    assetId: match.assetId,
    mediaType: match.mediaType || 'image',
    score: Number(match.score || 0),
    faceCount: match.faceCount || 0,
    creationTime: match.creationTime || null,
    frameTimeMs: match.frameTimeMs ?? null,
    verdict,
    recordedAt: new Date().toISOString(),
  };
}

function maxScore(matches) {
  return matches.reduce((max, match) => Math.max(max, Number(match.score || 0)), 0);
}

function minScore(matches) {
  return matches.reduce((min, match) => Math.min(min, Number(match.score || 1)), 1);
}

export async function recordCalibrationReview({ familyId, userId, accepted = [], rejected = [] }) {
  const previous = await getImportCalibration({ familyId, userId });
  const acceptedHigh = accepted.filter((match) => Number(match.score || 0) >= HIGH_CONFIDENCE_THRESHOLD);
  const rejectedHigh = rejected.filter((match) => Number(match.score || 0) >= HIGH_CONFIDENCE_THRESHOLD);

  const corrections = [
    ...previous.corrections,
    ...accepted.slice(0, 80).map((match) => compactMatch(match, 'keep')),
    ...rejected.slice(0, 80).map((match) => compactMatch(match, 'skip')),
  ].slice(-300);

  const negativeExamples = [
    ...previous.negativeExamples,
    ...rejected.slice(0, 80).map((match) => compactMatch(match, 'skip')),
  ].slice(-200);

  const rejectedCeiling = maxScore(rejectedHigh);
  const acceptedFloor = minScore(acceptedHigh);
  const autoSaveThreshold = rejectedHigh.length
    ? Math.min(0.98, Math.max(DEFAULT_AUTO_SAVE_THRESHOLD, rejectedCeiling + 0.03))
    : Math.min(0.96, Math.max(DEFAULT_AUTO_SAVE_THRESHOLD, acceptedFloor - 0.02));

  const autoSaveEnabled = acceptedHigh.length >= 5 && rejectedHigh.length === 0;
  const next = {
    ...previous,
    autoSaveEnabled,
    autoSaveThreshold,
    batchReviewMin: REVIEW_THRESHOLD,
    calibratedAt: new Date().toISOString(),
    corrections,
    negativeExamples,
  };

  return saveImportCalibration({ familyId, userId, calibration: next });
}

export async function recordNegativeExample({ familyId, userId, match }) {
  if (!match) return getImportCalibration({ familyId, userId });
  const previous = await getImportCalibration({ familyId, userId });
  const negativeExamples = [
    ...previous.negativeExamples,
    compactMatch(match, 'removed'),
  ].slice(-200);
  return saveImportCalibration({
    familyId,
    userId,
    calibration: {
      ...previous,
      autoSaveEnabled: false,
      negativeExamples,
      corrections: [
        ...previous.corrections,
        compactMatch(match, 'removed'),
      ].slice(-300),
    },
  });
}

export async function getRecentAutoSaves({ familyId, userId }) {
  if (!familyId || !userId) return [];
  const raw = await AsyncStorage.getItem(recentAutoSavesStorageKey({ familyId, userId }));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item?.assetId) : [];
  } catch {
    return [];
  }
}

async function writeRecentAutoSaves({ familyId, userId, rows }) {
  if (!familyId || !userId) return;
  const compact = (rows || [])
    .filter((item) => item?.assetId)
    .slice(0, RECENT_AUTO_SAVE_LIMIT);
  await AsyncStorage.setItem(recentAutoSavesStorageKey({ familyId, userId }), JSON.stringify(compact));
}

export async function recordRecentAutoSave({ familyId, userId, match }) {
  if (!familyId || !userId || !match?.assetId) return [];
  const previous = await getRecentAutoSaves({ familyId, userId });
  const withoutCurrent = previous.filter((item) => item.assetId !== match.assetId);
  const next = [
    {
      assetId: match.assetId,
      mediaType: match.mediaType || 'image',
      score: Number(match.score || 0),
      faceCount: match.faceCount || 0,
      creationTime: match.creationTime || null,
      frameTimeMs: match.frameTimeMs ?? null,
      uri: match.uri || null,
      savedAt: new Date().toISOString(),
    },
    ...withoutCurrent,
  ];
  await writeRecentAutoSaves({ familyId, userId, rows: next });
  return next.slice(0, RECENT_AUTO_SAVE_LIMIT);
}

export async function dismissRecentAutoSave({ familyId, userId, assetId }) {
  if (!familyId || !userId || !assetId) return [];
  const previous = await getRecentAutoSaves({ familyId, userId });
  const next = previous.filter((item) => item.assetId !== assetId);
  await writeRecentAutoSaves({ familyId, userId, rows: next });
  return next;
}

export function bucketForScore(score, calibration) {
  const value = Number(score || 0);
  const trust = normalizeCalibration(calibration);
  if (trust.autoSaveEnabled && value >= trust.autoSaveThreshold) return 'auto-save';
  if (value >= trust.batchReviewMin) return 'review';
  return 'ignore';
}

export async function getAutoSaveConfig({ familyId, userId }) {
  const calibration = await getImportCalibration({ familyId, userId });
  if (!calibration.autoSaveEnabled) return null;
  return {
    threshold: calibration.autoSaveThreshold,
    calibration,
  };
}

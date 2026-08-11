import { isNative } from './faceMatcher';
import { readPendingMediaLibraryChange, clearPendingMediaLibraryChange } from './mediaLibraryChanges';
import { listSavedAssetIds, markLocalAssetsDeleted } from './photoSync';
import {
  readScanCheckpoint,
  scanCheckpointForState,
  scanResumeState,
  sinceMsForScan,
  writeScanCheckpoint,
} from './scanCheckpoints';
import * as Scan from './scanController';
import { readReferenceProfile, representativeReference } from './recognitionReferences';
import { REVIEW_THRESHOLD } from './recognitionTrust';
import { clearICloudWait, readICloudRetryQueue, recordICloudWait } from './iCloudRetryQueue';
import { publishFamilyLibraryConnection } from './familyLibrarySync';
import { ensureLibraryPermission, getLibraryPermissionStatus } from './photos';
import { deviceTimeZone, getFamilyRitualSettings } from './ritualSettings';
import {
  markCandidatesUnavailable,
  markCandidatesDeleted,
  markCandidatesSeen,
  reconcileCompletedFullScan,
  listDurableICloudRetryAssetIds,
  listCachedAnalysisAssetIds,
  persistScanCandidates,
  restoreCandidatesAvailable,
} from './candidateLedgerStore';
import {
  LIBRARY_SCAN_PASS_MAX_DURATION_MS,
  LIBRARY_SCAN_PASS_MAX_PHOTOS,
} from './scanPacingModel';

export async function startLibraryScan({
  family,
  user,
  pendingLibraryChange,
  allowWithoutReference = true,
  waitForCompletion = false,
  requestPhotoPermission = false,
  entitlementActive = false,
} = {}) {
  if (!family?.id || !user?.id) return { started: false, reason: 'missing-context' };
  if (!['creator', 'partner'].includes(family?.me?.role)) {
    return { started: false, reason: 'role-cannot-scan' };
  }
  if (entitlementActive !== true) return { started: false, reason: 'inactive-entitlement' };
  if (Scan.isRunning()) return { started: false, reason: 'already-running' };
  const permission = requestPhotoPermission
    ? await ensureLibraryPermission()
    : await getLibraryPermissionStatus();
  if (!permission?.granted) {
    await publishFamilyLibraryConnection({
      familyId: family.id,
      userId: user.id,
      status: 'needs_permission',
    }).catch(() => {});
    return { started: false, reason: 'photo-permission' };
  }

  const checkpoint = await readScanCheckpoint({ familyId: family.id, userId: user.id });
  const change = pendingLibraryChange === undefined
    ? await readPendingMediaLibraryChange({ familyId: family.id, userId: user.id })
    : pendingLibraryChange;
  const resume = change?.requiresFullLibraryScan ? null : scanResumeState(checkpoint);
  if (change?.deletedAssetIds?.length) {
    try {
      await markLocalAssetsDeleted({
        familyId: family.id,
        ownerUserId: user.id,
        assetIds: change.deletedAssetIds,
        deletedAt: change.changedAt,
      });
    } catch {
      console.warn('deleted local asset reconciliation failed');
    }
    markCandidatesDeleted({
      familyId: family.id,
      userId: user.id,
      assetIds: change.deletedAssetIds,
      limited: permission.accessPrivileges === 'limited',
    });
  }

  const profile = await readReferenceProfile({ familyId: family.id, userId: user.id });
  const ref = representativeReference(profile);
  if (!allowWithoutReference && !ref?.embedding?.length && !profile.references?.some((item) => item?.embedding?.length)) {
    return { started: false, reason: 'missing-reference' };
  }
  const birthdayMs = family.babyBirthday
    ? new Date(`${family.babyBirthday}T00:00:00`).getTime()
    : undefined;
  const sinceMs = sinceMsForScan({
    babyBirthday: family.babyBirthday,
    checkpoint,
    forceFullRescan: change?.requiresFullLibraryScan,
  });
  const extraAssetIds = change?.requiresFullLibraryScan
    ? []
    : [...(change?.insertedAssetIds || []), ...(change?.updatedAssetIds || [])];
  const iCloudRetry = await readICloudRetryQueue({
    familyId: family.id,
    userId: user.id,
  }).catch(() => ({ assetIds: [] }));
  const durableICloudRetryAssetIds = listDurableICloudRetryAssetIds({
    familyId: family.id,
    userId: user.id,
  });
  const targetedAssetIds = [...new Set([
    ...extraAssetIds,
    ...(iCloudRetry.assetIds || []),
    ...durableICloudRetryAssetIds,
  ])];

  const skip = await listSavedAssetIds({
    familyId: family.id,
    ownerUserId: user.id,
  }).catch(() => new Set());
  const cachedAnalysisIds = listCachedAnalysisAssetIds({
    familyId: family.id,
    userId: user.id,
    sinceMs,
  });
  const updatedAssetIds = new Set(change?.updatedAssetIds || []);
  if (!change?.requiresFullLibraryScan) {
    for (const assetId of cachedAnalysisIds) {
      if (!updatedAssetIds.has(assetId)) skip.add(assetId);
    }
  }

  publishFamilyLibraryConnection({
    familyId: family.id,
    userId: user.id,
    status: 'scanning',
  }).catch(() => {});

  const ritualSettings = await getFamilyRitualSettings({
    familyId: family.id,
    family,
  }).catch(() => null);
  const captureTimezone = ritualSettings?.timezone && ritualSettings.timezone !== 'local'
    ? ritualSettings.timezone
    : deviceTimeZone() || 'UTC';

  const scanPromise = Scan.start({
    reference: ref,
    referenceProfile: profile,
    birthdayISO: family.babyBirthday,
    since: sinceMs,
    threshold: isNative ? REVIEW_THRESHOLD : null,
    // Product-recovery contract: discovery remains local until an explicit
    // parent Keep. There is no automatic upload or shared-memory write.
    autoSave: null,
    excludeIds: skip,
    extraAssetIds: targetedAssetIds,
    extraAssetCreatedAfterMs: birthdayMs,
    onICloudWait: ({ assetIds }) => recordICloudWait({
      familyId: family.id,
      userId: user.id,
      assetIds,
      source: 'scan',
      reason: 'Waiting for the original to download from iCloud.',
    }).then(() => markCandidatesUnavailable({
      familyId: family.id,
      userId: user.id,
      assetIds,
      reason: 'Waiting for the original to download from iCloud.',
    })),
    onICloudReady: ({ assetIds }) => Promise.all([
      clearICloudWait({ familyId: family.id, userId: user.id, assetIds }),
      Promise.resolve(restoreCandidatesAvailable({ familyId: family.id, userId: user.id, assetIds })),
    ]),
    onAnalysis: ({ matches, scanKey }) => persistScanCandidates({
      familyId: family.id,
      userId: user.id,
      scanKey,
      matches,
      birthdayISO: family.babyBirthday,
      captureTimezone,
    }),
    maxPhotoAssets: LIBRARY_SCAN_PASS_MAX_PHOTOS,
    maxScanDurationMs: LIBRARY_SCAN_PASS_MAX_DURATION_MS,
    startAfterPhotoCursor: resume?.photoCursor || undefined,
    startAfterVideoCursor: resume?.videoCursor || undefined,
    startPhotosComplete: resume?.photosComplete === true,
    startVideosComplete: resume?.videosComplete === true,
    onAssetsSeen: ({ assetIds, scanKey }) => markCandidatesSeen({
      familyId: family.id,
      userId: user.id,
      assetIds,
      scanKey,
    }),
    onComplete: async (finalState) => {
      if (!['done', 'aborted'].includes(finalState?.phase)) return;
      const historicalComplete = finalState?.photosComplete === true && finalState?.videosComplete === true;
      if (historicalComplete && change?.requiresFullLibraryScan) {
        reconcileCompletedFullScan({
          familyId: family.id,
          userId: user.id,
          scanKey: finalState.scanKey,
          sinceMs,
          limited: permission.accessPrivileges === 'limited',
        });
      }
      const nextCheckpoint = scanCheckpointForState({
        finalState,
        previousCheckpoint: checkpoint,
        sinceMs,
      });
      await writeScanCheckpoint({
        familyId: family.id,
        userId: user.id,
        checkpoint: nextCheckpoint,
      });
      if (!historicalComplete) return;
      await clearPendingMediaLibraryChange({
        familyId: family.id,
        userId: user.id,
      });
      await publishFamilyLibraryConnection({
        familyId: family.id,
        userId: user.id,
        status: 'ready',
        surfacedCount: finalState.totalMatchCount || finalState.acceptedCount || 0,
        savedCount: 0,
        completedAt: new Date(finalState.finishedAt || Date.now()).toISOString(),
      }).catch(() => {});
    },
  });
  const scanKey = Scan.getState().scanKey;
  if (waitForCompletion) {
    try {
      await scanPromise;
    } catch (err) {
      publishFamilyLibraryConnection({
        familyId: family.id,
        userId: user.id,
        status: 'error',
      }).catch(() => {});
      console.warn('library scan start failed');
      throw err;
    }
    const finalState = Scan.getState();
    return {
      started: true,
      scanKey,
      phase: finalState.phase,
      autoSavedCount: finalState.autoSavedCount,
      acceptedCount: finalState.acceptedCount,
    };
  }

  scanPromise.catch((err) => {
    publishFamilyLibraryConnection({
      familyId: family.id,
      userId: user.id,
      status: 'error',
    }).catch(() => {});
    console.warn('library scan start failed');
  });

  return { started: true, scanKey };
}

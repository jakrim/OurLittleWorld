import { isNative } from './faceMatcher';
import { readPendingMediaLibraryChange, clearPendingMediaLibraryChange } from './mediaLibraryChanges';
import { listSavedAssetIds, markLocalAssetsDeleted } from './photoSync';
import { readScanCheckpoint, sinceMsForScan, writeScanCheckpoint } from './scanCheckpoints';
import * as Scan from './scanController';
import { readReferenceProfile, representativeReference } from './recognitionReferences';
import { getAutoSaveConfig, recordRecentAutoSave, REVIEW_THRESHOLD } from './recognitionTrust';
import { Tags } from './storage';
import { clearICloudWait, readICloudRetryQueue, recordICloudWait } from './iCloudRetryQueue';
import { publishFamilyLibraryConnection } from './familyLibrarySync';
import { ensureLibraryPermission, getLibraryPermissionStatus } from './photos';
import { isMediaPolicyError } from './mediaPolicy';
import {
  markCandidatesUnavailable,
  listCachedAnalysisAssetIds,
  persistScanCandidates,
  restoreCandidatesAvailable,
} from './candidateLedgerStore';

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
    : change?.insertedAssetIds || [];
  const iCloudRetry = await readICloudRetryQueue({
    familyId: family.id,
    userId: user.id,
  }).catch(() => ({ assetIds: [] }));
  const targetedAssetIds = [...new Set([
    ...extraAssetIds,
    ...(iCloudRetry.assetIds || []),
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
  for (const assetId of cachedAnalysisIds) skip.add(assetId);

  const autoSaveConfig = await getAutoSaveConfig({
    familyId: family.id,
    userId: user.id,
  });
  const autoSave = autoSaveConfig
    ? {
      threshold: autoSaveConfig.threshold,
      save: async (assetId, match) => {
        try {
          await Tags.setBaby({
            familyId: family.id,
            assetId,
            isBaby: true,
            match,
            videoPosterOnly: false,
            source: 'daily-curation-auto-save',
          });
        } catch (error) {
          if (match?.mediaType !== 'video' || !isMediaPolicyError(error)) throw error;
          await Tags.setBaby({
            familyId: family.id,
            assetId,
            isBaby: true,
            match,
            videoPosterOnly: true,
            source: 'daily-curation-auto-save',
          });
        }
        await recordRecentAutoSave({
          familyId: family.id,
          userId: user.id,
          match: match || { assetId },
        });
      },
    }
    : null;

  publishFamilyLibraryConnection({
    familyId: family.id,
    userId: user.id,
    status: 'scanning',
  }).catch(() => {});

  const scanPromise = Scan.start({
    reference: ref,
    referenceProfile: profile,
    birthdayISO: family.babyBirthday,
    since: sinceMs,
    threshold: isNative ? REVIEW_THRESHOLD : null,
    autoSave,
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
    onCandidates: ({ matches, scanKey }) => persistScanCandidates({
      familyId: family.id,
      userId: user.id,
      scanKey,
      matches,
      birthdayISO: family.babyBirthday,
    }),
    onComplete: async (finalState) => {
      if (finalState?.phase !== 'done') return;
      await writeScanCheckpoint({
        familyId: family.id,
        userId: user.id,
        checkpoint: {
          lastScannedAt: new Date(finalState.finishedAt || Date.now()).toISOString(),
          lastCursor: JSON.stringify({
            scanKey: finalState.scanKey,
            seen: finalState.seen,
            total: finalState.total,
            sinceMs,
            mediaLibraryChangeAt: change?.changedAt || null,
            extraAssetCount: targetedAssetIds.length,
          }),
        },
      });
      await clearPendingMediaLibraryChange({
        familyId: family.id,
        userId: user.id,
      });
      await publishFamilyLibraryConnection({
        familyId: family.id,
        userId: user.id,
        status: 'ready',
        surfacedCount: finalState.totalMatchCount || finalState.acceptedCount || 0,
        savedCount: finalState.autoSavedCount || 0,
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

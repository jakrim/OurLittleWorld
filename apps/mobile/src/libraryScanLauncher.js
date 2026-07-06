import { embedFace, isNative } from './faceMatcher';
import { readPendingMediaLibraryChange, clearPendingMediaLibraryChange } from './mediaLibraryChanges';
import { listSavedAssetIds } from './photoSync';
import { readScanCheckpoint, sinceMsForScan, writeScanCheckpoint } from './scanCheckpoints';
import * as Scan from './scanController';
import { addTrustedReferenceImage, primaryReference, readReferenceProfile } from './recognitionReferences';
import { getAutoSaveConfig, recordRecentAutoSave, REVIEW_THRESHOLD } from './recognitionTrust';
import { Tags } from './storage';

export async function startLibraryScan({
  family,
  user,
  pendingLibraryChange,
  allowWithoutReference = true,
} = {}) {
  if (!family?.id || !user?.id) return { started: false, reason: 'missing-context' };
  if (Scan.isRunning()) return { started: false, reason: 'already-running' };

  const profile = await readReferenceProfile({ familyId: family.id, userId: user.id });
  const ref = primaryReference(profile);
  if (!allowWithoutReference && !ref?.embedding?.length && !profile.references?.some((item) => item?.embedding?.length)) {
    return { started: false, reason: 'missing-reference' };
  }

  const checkpoint = await readScanCheckpoint({ familyId: family.id, userId: user.id });
  const change = pendingLibraryChange === undefined
    ? await readPendingMediaLibraryChange({ familyId: family.id, userId: user.id })
    : pendingLibraryChange;
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

  const skip = await listSavedAssetIds({
    familyId: family.id,
    ownerUserId: user.id,
  }).catch(() => new Set());

  let trustedRefreshCount = 0;
  const autoSaveConfig = await getAutoSaveConfig({
    familyId: family.id,
    userId: user.id,
  });
  const autoSave = autoSaveConfig
    ? {
      threshold: autoSaveConfig.threshold,
      save: async (assetId, match) => {
        await Tags.setBaby({
          familyId: family.id,
          assetId,
          isBaby: true,
          match,
          videoPosterOnly: match?.mediaType === 'video',
        });
        await recordRecentAutoSave({
          familyId: family.id,
          userId: user.id,
          match: match || { assetId },
        });
        if (
          trustedRefreshCount < 2
          && isNative
          && match?.assetId
          && Number(match.score || 0) >= 0.9
          && (match.localUri || match.uri)
        ) {
          trustedRefreshCount += 1;
          try {
            const embedding = await embedFace(match.localUri || match.uri);
            if (embedding?.embedding?.length) {
              await addTrustedReferenceImage({
                familyId: family.id,
                userId: user.id,
                birthdayISO: family.babyBirthday,
                match,
                embedding: embedding.embedding,
                faceCount: embedding.faceCount || match.faceCount || 1,
              });
            }
          } catch (err) {
            console.warn('auto-save trusted reference refresh', err?.message);
          }
        }
      },
    }
    : null;

  const scanPromise = Scan.start({
    reference: ref,
    referenceProfile: profile,
    birthdayISO: family.babyBirthday,
    since: sinceMs,
    threshold: isNative ? REVIEW_THRESHOLD : null,
    autoSave,
    excludeIds: skip,
    extraAssetIds,
    extraAssetCreatedAfterMs: birthdayMs,
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
            extraAssetCount: extraAssetIds.length,
          }),
        },
      });
      await clearPendingMediaLibraryChange({
        familyId: family.id,
        userId: user.id,
      });
    },
  });
  scanPromise.catch((err) => {
    console.warn('library scan start failed', err?.message);
  });

  return { started: true, scanKey: Scan.getState().scanKey };
}

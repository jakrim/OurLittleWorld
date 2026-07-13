import { deleteForTag } from './photoSync';
import { dismissRecentAutoSave, recordNegativeExample } from './recognitionTrust';
import { autoSaveCorrectionTarget } from './autoSaveCorrectionModel';

export async function removeAutoSavedMemory({ familyId, userId, target }) {
  const normalized = autoSaveCorrectionTarget(target);
  if (!familyId) throw new Error('No family');
  if (!userId) throw new Error('Not signed in');
  if (!normalized.assetId) throw new Error('Missing asset id');
  if (!normalized.assetOwnerUserId) throw new Error('Missing asset owner');

  await recordNegativeExample({
    familyId,
    userId,
    match: normalized.match,
  });
  await deleteForTag({
    familyId,
    assetOwnerUserId: normalized.assetOwnerUserId,
    assetId: normalized.assetId,
  });
  const recentAutoSaves = await dismissRecentAutoSave({
    familyId,
    userId,
    assetId: normalized.assetId,
  }).catch(() => null);

  return {
    ...normalized,
    recentAutoSaves,
  };
}

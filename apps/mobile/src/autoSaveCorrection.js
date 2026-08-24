import { deleteForTag } from './photoSync';
import { dismissRecentAutoSave, recordNegativeExample } from './recognitionTrust';
import { autoSaveCorrectionTarget } from './autoSaveCorrectionModel';
import { resolveLocalAssetId, resolveRemoteAssetKey } from './mediaDb';

export async function removeAutoSavedMemory({ familyId, userId, target }) {
  const normalized = autoSaveCorrectionTarget(target);
  if (!familyId) throw new Error('No family');
  if (!userId) throw new Error('Not signed in');
  if (!normalized.assetId) throw new Error('Missing asset id');
  if (!normalized.assetOwnerUserId) throw new Error('Missing asset owner');

  const resolvedLocalAssetId = resolveLocalAssetId({
    familyId,
    ownerUserId: normalized.assetOwnerUserId,
    remoteAssetKey: normalized.assetId,
  });
  const mappedRemoteAssetKey = resolveRemoteAssetKey({
    familyId,
    ownerUserId: normalized.assetOwnerUserId,
    localAssetId: normalized.assetId,
  });
  const localAssetId = resolvedLocalAssetId || (mappedRemoteAssetKey ? normalized.assetId : null);

  if (localAssetId && normalized.assetOwnerUserId === userId) {
    await recordNegativeExample({
      familyId,
      userId,
      match: { ...normalized.match, assetId: localAssetId },
    });
  }
  await deleteForTag({
    familyId,
    assetOwnerUserId: normalized.assetOwnerUserId,
    assetId: localAssetId || normalized.assetId,
  });
  const recentAutoSaves = await dismissRecentAutoSave({
    familyId,
    userId,
    assetId: localAssetId || normalized.assetId,
  }).catch(() => null);

  return {
    ...normalized,
    recentAutoSaves,
  };
}

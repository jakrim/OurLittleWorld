export const LOCAL_ASSET_DELETED_STATUS = 'deleted_from_device';

export function markLocalAssetDeletedMetadata(metadata, deletedAt) {
  return {
    ...(metadata || {}),
    localAssetDeletedAt: metadata?.localAssetDeletedAt || deletedAt || new Date().toISOString(),
    localAssetStatus: LOCAL_ASSET_DELETED_STATUS,
  };
}

export function isLocalAssetDeleted(mediaOrMetadata) {
  const metadata = mediaOrMetadata?.metadata || mediaOrMetadata || {};
  return metadata.localAssetStatus === LOCAL_ASSET_DELETED_STATUS || !!metadata.localAssetDeletedAt;
}

export const MAX_STORED_MEDIA_CHANGE_ASSET_IDS = 500;

export function normalizeMediaLibraryChangeEvent(event = {}, now = new Date()) {
  const insertedAssetIds = uniqueAssetIds(event.insertedAssets);
  const deletedAssetIds = uniqueAssetIds(event.deletedAssets);
  const updatedAssetIds = uniqueAssetIds(event.updatedAssets);
  const deletedCount = Array.isArray(event.deletedAssets) ? event.deletedAssets.length : 0;
  const updatedCount = Array.isArray(event.updatedAssets) ? event.updatedAssets.length : 0;
  const hasIncrementalChanges = event?.hasIncrementalChanges === true;
  const stamp = now.toISOString();
  return {
    firstChangedAt: stamp,
    changedAt: stamp,
    eventCount: 1,
    hasIncrementalChanges,
    insertedCount: insertedAssetIds.length,
    deletedCount,
    updatedCount,
    insertedAssetIds: insertedAssetIds.slice(0, MAX_STORED_MEDIA_CHANGE_ASSET_IDS),
    deletedAssetIds: deletedAssetIds.slice(0, MAX_STORED_MEDIA_CHANGE_ASSET_IDS),
    updatedAssetIds: updatedAssetIds.slice(0, MAX_STORED_MEDIA_CHANGE_ASSET_IDS),
    insertedAssetIdsTruncated: insertedAssetIds.length > MAX_STORED_MEDIA_CHANGE_ASSET_IDS,
    deletedAssetIdsTruncated: deletedAssetIds.length > MAX_STORED_MEDIA_CHANGE_ASSET_IDS,
    updatedAssetIdsTruncated: updatedAssetIds.length > MAX_STORED_MEDIA_CHANGE_ASSET_IDS,
    requiresFullLibraryScan:
      !hasIncrementalChanges
      || insertedAssetIds.length > MAX_STORED_MEDIA_CHANGE_ASSET_IDS
      || deletedAssetIds.length > MAX_STORED_MEDIA_CHANGE_ASSET_IDS
      || updatedAssetIds.length > MAX_STORED_MEDIA_CHANGE_ASSET_IDS,
  };
}

export function normalizeStoredMediaLibraryChange(change) {
  if (!change) return null;
  const insertedAssetIds = uniqueAssetIds(change.insertedAssetIds);
  const deletedAssetIds = uniqueAssetIds(change.deletedAssetIds);
  const updatedAssetIds = uniqueAssetIds(change.updatedAssetIds);
  return {
    firstChangedAt: change.firstChangedAt || change.changedAt || new Date().toISOString(),
    changedAt: change.changedAt || new Date().toISOString(),
    eventCount: Number(change.eventCount || 1),
    hasIncrementalChanges: change.hasIncrementalChanges === true,
    insertedCount: Number(change.insertedCount || insertedAssetIds.length || 0),
    deletedCount: Number(change.deletedCount || deletedAssetIds.length || 0),
    updatedCount: Number(change.updatedCount || updatedAssetIds.length || 0),
    insertedAssetIds: insertedAssetIds.slice(0, MAX_STORED_MEDIA_CHANGE_ASSET_IDS),
    deletedAssetIds: deletedAssetIds.slice(0, MAX_STORED_MEDIA_CHANGE_ASSET_IDS),
    updatedAssetIds: updatedAssetIds.slice(0, MAX_STORED_MEDIA_CHANGE_ASSET_IDS),
    insertedAssetIdsTruncated: !!change.insertedAssetIdsTruncated,
    deletedAssetIdsTruncated: !!change.deletedAssetIdsTruncated,
    updatedAssetIdsTruncated: !!change.updatedAssetIdsTruncated,
    requiresFullLibraryScan: change.requiresFullLibraryScan !== false,
  };
}

export function mergeMediaLibraryChanges(previous, next) {
  const prev = normalizeStoredMediaLibraryChange(previous);
  const incoming = normalizeStoredMediaLibraryChange(next);
  if (!prev) return incoming;
  if (!incoming) return prev;
  const insertedAssetIds = uniqueAssetIds([...prev.insertedAssetIds, ...incoming.insertedAssetIds]);
  const deletedAssetIds = uniqueAssetIds([...prev.deletedAssetIds, ...incoming.deletedAssetIds]);
  const updatedAssetIds = uniqueAssetIds([...prev.updatedAssetIds, ...incoming.updatedAssetIds]);
  const insertedAssetIdsTruncated = prev.insertedAssetIdsTruncated
    || incoming.insertedAssetIdsTruncated || insertedAssetIds.length > MAX_STORED_MEDIA_CHANGE_ASSET_IDS;
  const deletedAssetIdsTruncated = prev.deletedAssetIdsTruncated
    || incoming.deletedAssetIdsTruncated || deletedAssetIds.length > MAX_STORED_MEDIA_CHANGE_ASSET_IDS;
  const updatedAssetIdsTruncated = prev.updatedAssetIdsTruncated
    || incoming.updatedAssetIdsTruncated || updatedAssetIds.length > MAX_STORED_MEDIA_CHANGE_ASSET_IDS;
  return {
    firstChangedAt: prev.firstChangedAt,
    changedAt: incoming.changedAt,
    eventCount: prev.eventCount + incoming.eventCount,
    hasIncrementalChanges: prev.hasIncrementalChanges && incoming.hasIncrementalChanges,
    insertedCount: prev.insertedCount + incoming.insertedCount,
    deletedCount: prev.deletedCount + incoming.deletedCount,
    updatedCount: prev.updatedCount + incoming.updatedCount,
    insertedAssetIds: insertedAssetIds.slice(0, MAX_STORED_MEDIA_CHANGE_ASSET_IDS),
    deletedAssetIds: deletedAssetIds.slice(0, MAX_STORED_MEDIA_CHANGE_ASSET_IDS),
    updatedAssetIds: updatedAssetIds.slice(0, MAX_STORED_MEDIA_CHANGE_ASSET_IDS),
    insertedAssetIdsTruncated,
    deletedAssetIdsTruncated,
    updatedAssetIdsTruncated,
    requiresFullLibraryScan: prev.requiresFullLibraryScan || incoming.requiresFullLibraryScan
      || insertedAssetIdsTruncated || deletedAssetIdsTruncated || updatedAssetIdsTruncated,
  };
}

function uniqueAssetIds(ids) {
  const out = [];
  const seen = new Set();
  for (const value of ids || []) {
    const candidate = value?.id || value?.assetId || value?.localIdentifier || value;
    const raw = candidate ? String(candidate) : '';
    const assetId = raw.startsWith('ph://') ? raw.slice('ph://'.length) : raw;
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);
    out.push(assetId);
  }
  return out;
}

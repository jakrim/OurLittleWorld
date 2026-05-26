import {
  Asset,
  AssetField,
  MediaType,
  Query,
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-media-library';

/**
 * Helpers that talk to the photo library on behalf of Our Little World.
 * All expo-media-library access goes through this module (SDK 56 Query + Asset API).
 */

const DESC_CREATION = { key: AssetField.CREATION_TIME, ascending: false };

function imageQuery(createdAfterMs) {
  let q = new Query()
    .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
    .orderBy(DESC_CREATION);
  if (createdAfterMs != null && Number.isFinite(createdAfterMs)) {
    q = q.gte(AssetField.CREATION_TIME, createdAfterMs);
  }
  return q;
}

/** iOS Vision module expects ph:// URIs; asset ids are local identifiers. */
export function uriForNativeVision(assetId) {
  if (!assetId) return assetId;
  if (
    assetId.startsWith('ph://')
    || assetId.startsWith('file://')
    || assetId.startsWith('content://')
    || assetId.startsWith('assets-library://')
  ) {
    return assetId;
  }
  return `ph://${assetId}`;
}

async function mapAssetToLegacy(asset) {
  const [uri, creationTime, width, height] = await Promise.all([
    asset.getUri(),
    asset.getCreationTime(),
    asset.getWidth().catch(() => 0),
    asset.getHeight().catch(() => 0),
  ]);
  return {
    id: asset.id,
    uri: uriForNativeVision(asset.id),
    localUri: uriForNativeVision(asset.id),
    creationTime: creationTime ?? 0,
    width: width || 0,
    height: height || 0,
  };
}

export async function mapAssetForScan(asset) {
  const [creationTime] = await Promise.all([asset.getCreationTime()]);
  return {
    assetId: asset.id,
    localUri: uriForNativeVision(asset.id),
    creationTime: creationTime ?? 0,
  };
}

export async function getLibraryPermissionStatus() {
  const perm = await getPermissionsAsync();
  return {
    granted: perm.status === 'granted',
    accessPrivileges: perm.accessPrivileges,
    canAskAgain: perm.canAskAgain !== false,
  };
}

export async function ensureLibraryPermission() {
  const current = await getPermissionsAsync();
  if (current.status === 'granted') {
    return { granted: true, accessPrivileges: current.accessPrivileges };
  }
  if (!current.canAskAgain) {
    return { granted: false, canAskAgain: false };
  }
  const next = await requestPermissionsAsync();
  return {
    granted: next.status === 'granted',
    accessPrivileges: next.accessPrivileges,
    canAskAgain: next.canAskAgain,
  };
}

/**
 * Fetch a page of photos sorted newest first.
 * `after` is an opaque offset string (legacy cursor compatibility).
 */
export async function fetchPhotosPage({ after, pageSize = 60, createdAfterMs } = {}) {
  const offset = after != null && after !== '' ? parseInt(String(after), 10) : 0;
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  const rows = await imageQuery(createdAfterMs).limit(pageSize).offset(safeOffset).exe();
  const assets = await Promise.all(rows.map(mapAssetToLegacy));
  return {
    assets,
    endCursor: String(safeOffset + rows.length),
    hasNextPage: rows.length === pageSize,
  };
}

/**
 * Count photos in the birthday→now window (offset paging; no totalCount in SDK 56).
 */
export async function countPhotosInWindow({ createdAfterMs, pageSize = 200 } = {}) {
  let offset = 0;
  let total = 0;
  for (;;) {
    const rows = await imageQuery(createdAfterMs).limit(pageSize).offset(offset).exe();
    total += rows.length;
    if (rows.length < pageSize) return total;
    offset += pageSize;
  }
}

/**
 * Load one library asset by id (replaces getAssetInfoAsync).
 */
export async function getAssetDetails(assetId, { downloadFromNetwork: _downloadFromNetwork = false } = {}) {
  if (!assetId) return null;
  const asset = new Asset(assetId);
  try {
    const [uri, creationTime, location, width, height] = await Promise.all([
      asset.getUri(),
      asset.getCreationTime(),
      asset.getLocation().catch(() => null),
      asset.getWidth().catch(() => null),
      asset.getHeight().catch(() => null),
    ]);
    const visionUri = uriForNativeVision(assetId);
    return {
      id: assetId,
      uri: visionUri,
      localUri: uri || visionUri,
      creationTime: creationTime ?? undefined,
      location,
      width: width ?? undefined,
      height: height ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Compute baby age at a given timestamp.
 * Returns a structured object so callers can format flexibly.
 */
export function ageAt(birthdayISO, takenAtMs) {
  if (!birthdayISO || !takenAtMs) return null;
  const birth = new Date(birthdayISO);
  const taken = new Date(takenAtMs);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(taken.getTime())) return null;

  let years = taken.getFullYear() - birth.getFullYear();
  let months = taken.getMonth() - birth.getMonth();
  let days = taken.getDate() - birth.getDate();

  if (days < 0) {
    months -= 1;
    const lastMonth = new Date(taken.getFullYear(), taken.getMonth(), 0);
    days += lastMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const diffMs = taken.getTime() - birth.getTime();
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const beforeBirth = diffMs < 0;

  return { years, months, days, totalDays, beforeBirth };
}

export function formatAge(age) {
  if (!age) return '';
  if (age.beforeBirth) return 'before they were born';
  if (age.totalDays === 0) return 'birth day';
  if (age.years === 0 && age.months === 0) {
    return `${age.totalDays} day${age.totalDays === 1 ? '' : 's'} old`;
  }
  if (age.years === 0) {
    const m = `${age.months} month${age.months === 1 ? '' : 's'}`;
    const d = age.days ? ` ${age.days}d` : '';
    return `${m}${d}`;
  }
  const y = `${age.years} year${age.years === 1 ? '' : 's'}`;
  const m = age.months ? ` ${age.months}m` : '';
  return `${y}${m}`;
}

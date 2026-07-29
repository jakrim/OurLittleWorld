export const ACCOUNT_DELETION_CONFIRMATION = 'DELETE';
export const ACCOUNT_DELETION_STORAGE_BUCKET = 'family-photos';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STREAM_UID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
const PROVIDER_OBJECT_PATTERN = /^[A-Za-z0-9._-]{1,160}$/;

export function isUuid(value: unknown): value is string {
  return UUID_PATTERN.test(String(value || ''));
}

export function requireDeletionConfirmation(value: unknown) {
  if (String(value || '').trim() !== ACCOUNT_DELETION_CONFIRMATION) {
    throw new Error('Type DELETE to confirm account deletion.');
  }
}

export function normalizeOtp(value: unknown) {
  const token = String(value || '').replace(/\s/g, '');
  return /^\d{6}$/.test(token) ? token : null;
}

export function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeFamilyIds(values: unknown) {
  return uniqueStrings(values).filter(isUuid);
}

export function normalizeStreamUids(values: unknown) {
  return uniqueStrings(values).filter((value) => STREAM_UID_PATTERN.test(value));
}

export function normalizeProviderObjectIds(values: unknown) {
  return uniqueStrings(values).filter((value) => PROVIDER_OBJECT_PATTERN.test(value));
}

export function normalizeFamilyStoragePaths(familyId: string, values: unknown) {
  if (!isUuid(familyId)) return [];
  const prefix = `${familyId}/`;
  return uniqueStrings(values)
    .map((value) => value.replace(/^\/+/, ''))
    .filter((value) => value.startsWith(prefix))
    .filter((value) => !value.includes('..'))
    .filter((value) => value.length <= 1024);
}

export function storageListingEntryPath(prefix: string, entry: Record<string, unknown>) {
  const name = String(entry?.name || '').replace(/^\/+|\/+$/g, '');
  if (!name || name === '.' || name === '..' || name.includes('/../')) return null;
  return `${String(prefix || '').replace(/\/+$/g, '')}/${name}`.replace(/^\/+/, '');
}

export function splitStorageListing(
  familyId: string,
  prefix: string,
  entries: Array<Record<string, unknown>> = [],
) {
  const files: string[] = [];
  const folders: string[] = [];
  for (const entry of entries) {
    const path = storageListingEntryPath(prefix, entry);
    if (!path || !normalizeFamilyStoragePaths(familyId, [path]).length) continue;
    const isFolder = !entry.id && !entry.metadata;
    if (isFolder) folders.push(path);
    else files.push(path);
  }
  return {
    files: [...new Set(files)].sort(),
    folders: [...new Set(folders)].sort(),
  };
}

export function publicDeletionPreview(value: Record<string, unknown> | null | undefined) {
  return {
    familyCount: nonNegativeInteger(value?.family_count),
    soleWriterCount: nonNegativeInteger(value?.sole_writer_count),
    additionalWriterCount: nonNegativeInteger(value?.additional_writer_count),
    circleCount: nonNegativeInteger(value?.circle_count),
    storeSubscriptionActionRequired: Boolean(value?.store_subscription_action_required),
    stripeCancellationRequired: Boolean(value?.stripe_cancellation_required),
  };
}

export function providerCleanupSummary({
  storageDeleted = 0,
  streamDeleted = 0,
  r2DeleteRequests = 0,
  stripeCanceled = 0,
}: {
  storageDeleted?: number;
  streamDeleted?: number;
  r2DeleteRequests?: number;
  stripeCanceled?: number;
} = {}) {
  return {
    storage_deleted_count: nonNegativeInteger(storageDeleted),
    stream_deleted_count: nonNegativeInteger(streamDeleted),
    r2_delete_request_count: nonNegativeInteger(r2DeleteRequests),
    stripe_canceled_count: nonNegativeInteger(stripeCanceled),
  };
}

function uniqueStrings(values: unknown) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

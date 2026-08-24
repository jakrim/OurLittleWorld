export const READ_ONLY_ARCHIVE_STATUSES = new Set([
  'canceled',
  'expired',
  'past_due',
]);

export function hasReadOnlyArchiveAccess(entitlement) {
  return Boolean(
    entitlement?.isActive
    || READ_ONLY_ARCHIVE_STATUSES.has(String(entitlement?.status || '')),
  );
}

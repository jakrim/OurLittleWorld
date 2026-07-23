export const DEFAULT_SCAN_PHOTO_PAGE_SIZE = 60;
export const FIRST_VALUE_SCAN_PHOTO_PAGE_SIZE = 8;

export function resolveScanPhotoPageSize(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_SCAN_PHOTO_PAGE_SIZE;
  return Math.min(DEFAULT_SCAN_PHOTO_PAGE_SIZE, parsed);
}

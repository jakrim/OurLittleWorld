export const DEFAULT_SCAN_PHOTO_PAGE_SIZE = 60;
export const FIRST_VALUE_SCAN_PHOTO_PAGE_SIZE = 8;
export const FIRST_VALUE_SCAN_MAX_PHOTOS = 48;
export const FIRST_VALUE_SCAN_MAX_DURATION_MS = 24_000;

export function resolveScanPhotoPageSize(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_SCAN_PHOTO_PAGE_SIZE;
  return Math.min(DEFAULT_SCAN_PHOTO_PAGE_SIZE, parsed);
}

export function firstValueProgressCopy({
  checked = 0,
  total = null,
  batchSize = 0,
  timedOutBatches = 0,
  skipped = 0,
  maxPhotos = FIRST_VALUE_SCAN_MAX_PHOTOS,
} = {}) {
  const checkedCount = Math.max(0, Number(checked) || 0);
  const skippedCount = Math.max(0, Number(skipped) || 0);
  const totalCount = Math.max(0, Number(total) || 0);
  const maxPhotoCount = Math.max(1, Number(maxPhotos) || FIRST_VALUE_SCAN_MAX_PHOTOS);
  const searchLimit = Math.min(totalCount || maxPhotoCount, maxPhotoCount);
  if (batchSize > 0 && checkedCount === 0) {
    return {
      eyebrow: `${batchSize.toLocaleString()} of up to ${searchLimit.toLocaleString()} prepared`,
      detail: 'A quick private sample—not your whole library.',
    };
  }
  if (batchSize > 0) {
    return {
      eyebrow: `${checkedCount.toLocaleString()} checked`,
      detail: timedOutBatches > 0
        ? 'Skipping a slow original and checking the next small group.'
        : 'Checking the next small group on your phone.',
    };
  }
  return {
    eyebrow: checkedCount > 0
      ? `${checkedCount.toLocaleString()} checked`
      : 'Preparing a small private search',
    detail: timedOutBatches > 0 || skippedCount > 0
      ? skippedCount > 0
        ? `${skippedCount.toLocaleString()} slow ${skippedCount === 1 ? 'photo was' : 'photos were'} skipped so you never have to wait.`
        : 'A slow original was skipped so you never have to wait on it.'
      : 'Nothing is uploaded before you approve it.',
  };
}

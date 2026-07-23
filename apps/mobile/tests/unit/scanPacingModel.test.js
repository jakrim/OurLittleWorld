import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SCAN_PHOTO_PAGE_SIZE,
  FIRST_VALUE_SCAN_PHOTO_PAGE_SIZE,
  resolveScanPhotoPageSize,
} from '../../src/scanPacingModel.js';

test('first-value discovery uses a bounded batch while regular scans retain throughput', () => {
  assert.equal(FIRST_VALUE_SCAN_PHOTO_PAGE_SIZE, 8);
  assert.equal(DEFAULT_SCAN_PHOTO_PAGE_SIZE, 60);
  assert.equal(resolveScanPhotoPageSize(FIRST_VALUE_SCAN_PHOTO_PAGE_SIZE), 8);
  assert.equal(resolveScanPhotoPageSize(undefined), DEFAULT_SCAN_PHOTO_PAGE_SIZE);
});

test('scan page size rejects invalid input and caps oversized batches', () => {
  assert.equal(resolveScanPhotoPageSize(0), DEFAULT_SCAN_PHOTO_PAGE_SIZE);
  assert.equal(resolveScanPhotoPageSize('nope'), DEFAULT_SCAN_PHOTO_PAGE_SIZE);
  assert.equal(resolveScanPhotoPageSize(120), DEFAULT_SCAN_PHOTO_PAGE_SIZE);
});

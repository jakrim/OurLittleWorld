import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SCAN_PHOTO_PAGE_SIZE,
  FIRST_VALUE_SCAN_MAX_DURATION_MS,
  FIRST_VALUE_SCAN_MAX_PHOTOS,
  FIRST_VALUE_SCAN_PHOTO_PAGE_SIZE,
  FIRST_VALUE_SCAN_WATCHDOG_MS,
  firstValueProgressCopy,
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

test('first-value discovery has an honest bounded search budget', () => {
  assert.equal(FIRST_VALUE_SCAN_MAX_PHOTOS, 48);
  assert.equal(FIRST_VALUE_SCAN_MAX_DURATION_MS, 24_000);
  assert.equal(FIRST_VALUE_SCAN_WATCHDOG_MS, 26_000);
});

test('first-value progress distinguishes prepared from actually checked photos', () => {
  assert.deepEqual(firstValueProgressCopy({
    checked: 0,
    total: 4286,
    batchSize: 8,
  }), {
    eyebrow: 'Quick private search',
    detail: 'Checking a small sample of up to 48 photos.',
  });
  assert.deepEqual(firstValueProgressCopy({
    checked: 8,
    total: 4286,
    batchSize: 8,
    timedOutBatches: 1,
  }), {
    eyebrow: 'Quick private search',
    detail: 'Skipping a slow photo and checking a few more.',
  });
  assert.deepEqual(firstValueProgressCopy({
    checked: 0,
    batchSize: 0,
    timedOutBatches: 1,
    skipped: 8,
  }), {
    eyebrow: 'Quick private search',
    detail: 'A few slow photos were skipped so you never have to wait.',
  });
});

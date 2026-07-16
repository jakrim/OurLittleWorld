import assert from 'node:assert/strict';
import test from 'node:test';

import { archivePageRanges } from '../../src/archivePaginationModel.js';

test('a 5,000-moment family archive is read in stable 500-row pages', () => {
  const ranges = archivePageRanges(5000);

  assert.equal(ranges.length, 10);
  assert.deepEqual(ranges[0], { offset: 0, take: 500, from: 0, to: 499 });
  assert.deepEqual(ranges.at(-1), { offset: 4500, take: 500, from: 4500, to: 4999 });
});

test('small and partial archive limits do not over-fetch', () => {
  assert.deepEqual(archivePageRanges(120), [
    { offset: 0, take: 120, from: 0, to: 119 },
  ]);
  assert.deepEqual(archivePageRanges(650), [
    { offset: 0, take: 500, from: 0, to: 499 },
    { offset: 500, take: 150, from: 500, to: 649 },
  ]);
  assert.deepEqual(archivePageRanges(0), []);
});

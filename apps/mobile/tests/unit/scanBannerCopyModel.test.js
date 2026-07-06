import test from 'node:test';
import assert from 'node:assert/strict';

import { scanReviewCaption, scanReviewTitle } from '../../src/scanBannerCopyModel.js';

test('scan review title uses parent-facing photo copy', () => {
  assert.equal(scanReviewTitle({ waiting: 12, babyName: 'Reuben' }), '12 new photos look like Reuben — take a look.');
  assert.equal(scanReviewTitle({ waiting: 1 }), '1 new photo looks like your little one — take a look.');
});

test('scan review caption avoids infrastructure language', () => {
  const caption = scanReviewCaption({ waiting: 0, babyName: 'Reuben' });

  assert.equal(scanReviewCaption({ waiting: 3, babyName: 'Reuben' }), "They'll wait for your okay before joining the vault.");
  assert.equal(caption, 'Looking for photos that look like Reuben.');
  assert.equal(caption.includes('media that needs a parent'), false);
});

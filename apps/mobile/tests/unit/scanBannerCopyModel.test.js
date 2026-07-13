import test from 'node:test';
import assert from 'node:assert/strict';

import { scanReviewCaption, scanReviewTitle } from '../../src/scanBannerCopyModel.js';

test('scan review title uses parent-facing photo copy', () => {
  assert.equal(scanReviewTitle({ waiting: 12, babyName: 'Reuben' }), '12 likely photos are worth a look for Reuben.');
  assert.equal(scanReviewTitle({ waiting: 1 }), '1 likely photo is worth a look for your little one.');
});

test('scan review caption avoids infrastructure language', () => {
  const caption = scanReviewCaption({ waiting: 0, babyName: 'Reuben' });

  assert.equal(
    scanReviewCaption({ waiting: 3, babyName: 'Reuben' }),
    'Review starts with likely matches. Remove anything that does not belong; after trust is earned, clear future matches can save automatically.',
  );
  assert.equal(caption, 'Looking for likely photos of Reuben. First review builds trust before clear matches can save automatically.');
  assert.equal(caption.includes('media that needs a parent'), false);
  assert.equal(caption.includes('threshold'), false);
  assert.equal(caption.includes('confidence'), false);
  assert.equal(caption.includes('calibration'), false);
});

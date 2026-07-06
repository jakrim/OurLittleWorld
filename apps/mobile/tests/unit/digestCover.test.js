import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickDigestCoverUri } from '../../src/digestCover.js';

const photo = (owner, asset, thumbUrl) => ({ asset_owner_user_id: owner, asset_id: asset, thumbUrl });

test('cover photo with a URL wins', () => {
  const uri = pickDigestCoverUri({
    coverPhoto: { thumbUrl: 'cover.jpg' },
    latestFirst: null,
    sharedPhotos: [photo('u1', 'a1', 'shared.jpg')],
  });
  assert.equal(uri, 'cover.jpg');
});

test('falls back to the latest milestone attached photo', () => {
  const uri = pickDigestCoverUri({
    coverPhoto: null,
    latestFirst: { asset_owner_user_id: 'u1', asset_id: 'a2' },
    sharedPhotos: [photo('u1', 'a1', 'recent.jpg'), photo('u1', 'a2', 'milestone.jpg')],
  });
  assert.equal(uri, 'milestone.jpg');
});

test('falls back to any recent shared photo', () => {
  const uri = pickDigestCoverUri({
    coverPhoto: { thumbUrl: null },
    latestFirst: { asset_owner_user_id: 'u1', asset_id: 'missing' },
    sharedPhotos: [photo('u1', 'a1', null), photo('u1', 'a2', 'recent.jpg')],
  });
  assert.equal(uri, 'recent.jpg');
});

test('returns null when nothing has a URL — caller hides the block', () => {
  const uri = pickDigestCoverUri({ coverPhoto: null, latestFirst: null, sharedPhotos: [photo('u1', 'a1', null)] });
  assert.equal(uri, null);
});

test('fullUrl is used when thumbUrl missing', () => {
  const uri = pickDigestCoverUri({ coverPhoto: { fullUrl: 'full.jpg' }, sharedPhotos: [] });
  assert.equal(uri, 'full.jpg');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { readMediaLibraryAssetDetails } from '../../src/photoAssetDetailsModel.js';

const CAPTURE_TIME = new Date('2025-12-24T16:30:00.000Z').getTime();

test('preserves grounded capture time when the local media URI cannot be read', async () => {
  const details = await readMediaLibraryAssetDetails({
    asset: fixtureAsset({
      getUri: () => { throw new Error('The original is not local'); },
      getCreationTime: () => CAPTURE_TIME,
    }),
    assetId: 'picker-asset',
    visionUri: 'ph://picker-asset',
  });

  assert.equal(details.creationTime, CAPTURE_TIME);
  assert.equal(details.localUri, null);
  assert.equal(details.downloadStatus, 'failed');
  assert.match(details.downloadError, /not local/);
});

test('keeps a usable media result while capture time remains truthfully unknown', async () => {
  const details = await readMediaLibraryAssetDetails({
    asset: fixtureAsset({
      getUri: () => 'file:///picked-photo.jpg',
      getCreationTime: async () => { throw new Error('No creation date'); },
    }),
    assetId: 'undated-asset',
    visionUri: 'ph://undated-asset',
  });

  assert.equal(details.localUri, 'file:///picked-photo.jpg');
  assert.equal(details.downloadStatus, 'ready');
  assert.equal(details.creationTime, undefined);
});

test('uses the Photos URI while a cloud-backed asset is still pending', async () => {
  const details = await readMediaLibraryAssetDetails({
    asset: fixtureAsset({ getUri: () => null }),
    assetId: 'cloud-asset',
    visionUri: 'ph://cloud-asset',
  });

  assert.equal(details.localUri, 'ph://cloud-asset');
  assert.equal(details.downloadStatus, 'pending');
  assert.equal(details.creationTime, CAPTURE_TIME);
});

function fixtureAsset(overrides = {}) {
  return {
    getUri: async () => 'file:///asset.jpg',
    getCreationTime: async () => CAPTURE_TIME,
    getLocation: async () => null,
    getWidth: async () => 3024,
    getHeight: async () => 4032,
    getMediaType: async () => 'image',
    getDuration: async () => null,
    getFilename: async () => 'synthetic.jpg',
    ...overrides,
  };
}

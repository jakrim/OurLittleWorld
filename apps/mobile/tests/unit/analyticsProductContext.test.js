import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyticsPlatform,
  childAgeBand,
  mediaKindForAssets,
  productKeyForTier,
} from '../../src/analyticsProductContext.js';

test('child age analytics uses coarse bands and never returns the birthday', () => {
  const now = new Date('2026-07-11T12:00:00Z');
  assert.equal(childAgeBand('2026-06-11', now), '0_3m');
  assert.equal(childAgeBand('2025-07-11', now), '6_12m');
  assert.equal(childAgeBand('not-a-date', now), 'unknown');
  assert.equal(childAgeBand('2026-06-11', now).includes('2026'), false);
});

test('purchase product keys stay inside the analytics allowlist', () => {
  assert.equal(productKeyForTier('family', 'monthly'), 'family_month');
  assert.equal(productKeyForTier('family', 'yearly'), 'family_year');
  assert.equal(productKeyForTier('vault', 'monthly'), 'vault_month');
  assert.equal(productKeyForTier('vault', 'yearly'), 'vault_year');
});

test('media analytics emits type categories instead of asset identifiers', () => {
  assert.equal(mediaKindForAssets([{ type: 'image', uri: 'private' }]), 'photo');
  assert.equal(mediaKindForAssets([{ type: 'video', assetId: 'private' }]), 'video');
  assert.equal(mediaKindForAssets([{ type: 'image' }, { type: 'video' }]), 'photo_video');
  assert.equal(mediaKindForAssets([], true), 'voice');
});

test('native analytics distinguishes supported iOS and Android funnels', () => {
  assert.equal(analyticsPlatform('ios'), 'ios');
  assert.equal(analyticsPlatform('android'), 'android');
  assert.equal(analyticsPlatform('windows'), 'unknown');
});

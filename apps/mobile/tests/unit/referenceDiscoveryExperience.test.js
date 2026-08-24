import assert from 'node:assert/strict';
import test from 'node:test';

import {
  autoSeedProgressCopy,
  selectAutoSeedSuggestions,
} from '../../src/referenceAutoSeedModel.js';
import {
  referenceDiscoveryBackTarget,
  referenceDiscoveryTrustCopy,
} from '../../src/referenceDiscoveryExperienceModel.js';

test('reference discovery presents measured possibilities without confirming identity', () => {
  const suggestions = selectAutoSeedSuggestions({
    clusters: [
      {
        members: [
          { assetId: 'a', captureQuality: 0.9, embedding: [1, 0], localUri: 'file:///a.jpg', faceCount: 1 },
          { assetId: 'a-peer', captureQuality: 0.8, embedding: [0.99, 0.01], localUri: 'file:///a-peer.jpg', faceCount: 1 },
        ],
      },
      {
        members: [
          { assetId: 'b', captureQuality: 0.8, embedding: [0, 1], localUri: 'file:///b.jpg', faceCount: 1 },
          { assetId: 'b-peer', captureQuality: 0.75, embedding: [0.01, 0.99], localUri: 'file:///b-peer.jpg', faceCount: 1 },
        ],
      },
    ],
  });
  assert.ok(suggestions.length <= 3);
  const copy = referenceDiscoveryTrustCopy({ babyName: 'Child' });
  assert.match(copy.possibility, /possibilities, not confirmed matches/);
  assert.match(copy.privacy, /this iPhone/);
  assert.doesNotMatch(copy.possibility, /definitely|we know/i);
});

test('first-value Back returns to a stable resumable setup destination', () => {
  assert.deepEqual(referenceDiscoveryBackTarget({ firstValueRequested: true, canGoBack: true }), {
    action: 'replace',
    destination: {
      pathname: '/setup',
      params: { source: 'first_value', resumeDiscovery: '1' },
    },
  });
  assert.deepEqual(referenceDiscoveryBackTarget({ canGoBack: true }), { action: 'back', destination: null });
  assert.match(autoSeedProgressCopy({ phase: 'analyzing', completed: 3, total: 12 }).title, /clear face/i);
});

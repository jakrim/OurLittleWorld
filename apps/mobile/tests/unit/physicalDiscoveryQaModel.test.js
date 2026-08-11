import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPhysicalDiscoveryQaCandidates,
  emptyPhysicalDiscoveryQaCounts,
  physicalDiscoveryQaSummary,
  recordPhysicalDiscoveryQaClassification,
} from '../../src/physicalDiscoveryQaModel.js';

test('physical discovery QA strips identifiers and limits the private visual review to 30', () => {
  const rows = Array.from({ length: 35 }, (_, index) => ({
    asset_id: `private-${index}`,
    local_uri: `file://private-${index}.jpg`,
    media_type: index === 0 ? 'video' : 'image',
  }));
  const candidates = buildPhysicalDiscoveryQaCandidates(rows);

  assert.equal(candidates.length, 30);
  assert.deepEqual(candidates[0], { mediaUri: 'file://private-0.jpg', mediaType: 'video' });
  assert.equal('assetId' in candidates[0], false);
});

test('physical discovery QA keeps only aggregate category counts', () => {
  let counts = emptyPhysicalDiscoveryQaCounts();
  counts = recordPhysicalDiscoveryQaClassification(counts, 'useful');
  counts = recordPhysicalDiscoveryQaClassification(counts, 'adultOnly');
  counts = recordPhysicalDiscoveryQaClassification(counts, 'duplicate');
  counts = recordPhysicalDiscoveryQaClassification(counts, 'weak');
  const summary = physicalDiscoveryQaSummary(counts);

  assert.deepEqual(summary, {
    total: 4,
    usefulChildPrecision: 0.25,
    adultOnlyFalsePositives: 1,
    duplicates: 1,
    weak: 1,
  });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  normalizeReferenceProfile,
  removeReferenceFromProfile,
  representativeReference,
  selectReferencesForCandidates,
} from '../../src/recognitionReferenceModel.js';

test('reopening and chronological sorting preserve the explicit representative', () => {
  const refs = [reference('old-clear', 10, 0.95), reference('new-poor', 20, 0.1)];
  const profile = normalizeReferenceProfile({
    references: refs,
    representativeReferenceId: 'ref-old-clear',
  });
  const reopened = normalizeReferenceProfile({ ...profile, references: [...profile.references].reverse() });

  assert.equal(representativeReference(reopened).assetId, 'old-clear');
  assert.equal(reopened.representativeReferenceId, 'ref-old-clear');
});

test('adding a newer low-quality reference cannot replace the representative', () => {
  const profile = normalizeReferenceProfile({
    references: [reference('clear', 10, 0.95), reference('new-poor', 999, 0.05)],
    representativeReferenceId: 'ref-clear',
  });
  assert.equal(representativeReference(profile).assetId, 'clear');
});

test('removing the representative chooses the next strongest eligible reference', () => {
  const profile = normalizeReferenceProfile({
    references: [
      reference('best', 10, 0.95),
      reference('next', 20, 0.8),
      reference('poor', 30, 0.1),
    ],
    representativeReferenceId: 'ref-best',
  });
  const next = removeReferenceFromProfile(profile, { assetId: 'best' });
  assert.equal(representativeReference(next).assetId, 'next');
});

test('existing persisted profiles without a representative field migrate deterministically', () => {
  const legacy = normalizeReferenceProfile({
    references: [reference('z-latest', 20, null), reference('a-stable', 10, null)],
  });
  assert.ok(legacy.representativeReferenceId);
  assert.equal(representativeReference(legacy).assetId, 'a-stable');
});

test('matching reference selection is independent of array order and excludes poor newest photos', () => {
  const refs = [
    reference('strong-a', 100, 0.95, 100),
    reference('strong-b', 200, 0.9, 200),
    reference('strong-c', 300, 0.85, 300),
    reference('strong-d', 400, 0.8, 400),
    reference('new-poor', 999, 0.02, 500),
  ];
  const args = {
    birthdayISO: '2025-01-01',
    candidates: [{ creationTime: new Date('2026-01-01').getTime() }],
    limit: 4,
  };
  const forward = selectReferencesForCandidates({ references: refs }, args).map((item) => item.assetId);
  const reversed = selectReferencesForCandidates({ references: [...refs].reverse() }, args).map((item) => item.assetId);

  assert.deepEqual(reversed, forward);
  assert.equal(forward.includes('new-poor'), false);
});

function reference(assetId, capturedAt, qualityScore, ageAtCaptureDays = capturedAt) {
  return {
    id: `ref-${assetId}`,
    assetId,
    uri: `ph://${assetId}`,
    embedding: [1, 0],
    capturedAt,
    ageAtCaptureDays,
    source: 'auto-seed',
    qualityScore,
    identityConfidence: 0.9,
  };
}

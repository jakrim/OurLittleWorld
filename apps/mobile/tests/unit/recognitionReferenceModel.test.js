import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  aggregateReferenceMatches,
  normalizeReferenceProfile,
  removeReferenceFromProfile,
  representativeReference,
  selectExplicitReferenceLearningCandidates,
  selectReferencesForCandidates,
} from '../../src/recognitionReferenceModel.js';

test('one polluted learned reference cannot admit an unrelated face', () => {
  const references = [
    { ...reference('confirmed', 10, 0.9), parentConfirmed: true },
    { ...reference('polluted', 20, 0.9), source: 'trusted-save' },
    reference('age-two', 30, 0.9),
  ];
  const decision = aggregateReferenceMatches({
    representativeReferenceId: references[0].id,
    entries: [
      scored(references[0], 0.42),
      scored(references[1], 0.96),
      scored(references[2], 0.51),
    ],
  });

  assert.equal(decision.passed, false);
  assert.equal(decision.score, 0);
});

test('a parent-confirmed reference plus an age-diverse reference must agree', () => {
  const references = [
    { ...reference('confirmed', 10, 0.9), parentConfirmed: true },
    reference('age-two', 200, 0.9),
  ];
  const decision = aggregateReferenceMatches({
    representativeReferenceId: references[0].id,
    entries: [scored(references[0], 0.74), scored(references[1], 0.78)],
  });

  assert.equal(decision.passed, true);
  assert.equal(decision.supportCount, 2);
  assert.equal(decision.score, 0.76);
});

test('a single confirmed reference uses raw identity without a quality boost', () => {
  const confirmed = { ...reference('confirmed', 10, 0.9), parentConfirmed: true };
  const rejected = aggregateReferenceMatches({
    representativeReferenceId: confirmed.id,
    entries: [scored(confirmed, 0.69)],
  });
  const accepted = aggregateReferenceMatches({
    representativeReferenceId: confirmed.id,
    entries: [scored(confirmed, 0.7)],
  });

  assert.equal(rejected.passed, false);
  assert.equal(accepted.passed, true);
  assert.equal(accepted.score, 0.7);
});

test('only an explicit parent keep can become a learned identity reference', () => {
  const matches = [
    { assetId: 'daily-default', score: 0.96, faceCount: 1, localUri: 'ph://default' },
    { assetId: 'parent-keep', score: 0.84, faceCount: 1, localUri: 'ph://keep' },
  ];

  const candidates = selectExplicitReferenceLearningCandidates(matches, new Set(['parent-keep']));

  assert.deepEqual(candidates.map((match) => match.assetId), ['parent-keep']);
});

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

function scored(referenceRow, score) {
  return {
    reference: referenceRow,
    result: { assetId: 'candidate', score, faceCount: 1 },
    ageWeight: 1.24,
  };
}

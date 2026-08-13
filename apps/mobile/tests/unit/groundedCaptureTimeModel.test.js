import assert from 'node:assert/strict';
import test from 'node:test';

import {
  groundedCaptureIso,
  groundedCaptureTime,
  isUnknownCaptureTimeError,
  requireGroundedCaptureIso,
  UNKNOWN_CAPTURE_TIME_CODE,
} from '../../src/groundedCaptureTimeModel.js';

test('native Photos capture time is authoritative when present', () => {
  assert.equal(groundedCaptureTime(1_786_493_600_000, 1_700_000_000_000), 1_786_493_600_000);
});

test('a durable candidate capture time survives a missing native re-read', () => {
  assert.equal(groundedCaptureIso(null, 1_786_493_600_000), '2026-08-12T00:13:20.000Z');
});

test('unknown capture time stays unknown instead of becoming Keep time', () => {
  assert.equal(groundedCaptureTime(undefined, 0, 'not-a-date'), null);
  assert.equal(groundedCaptureIso(undefined, null), null);
  assert.throws(
    () => requireGroundedCaptureIso(undefined, 0, 'not-a-date'),
    (error) => error.code === UNKNOWN_CAPTURE_TIME_CODE && isUnknownCaptureTimeError(error),
  );
});

test('required capture time preserves the first grounded native or candidate value', () => {
  assert.equal(requireGroundedCaptureIso(1_786_493_600_000), '2026-08-12T00:13:20.000Z');
  assert.equal(requireGroundedCaptureIso(null, '2026-07-04T18:30:00.000Z'), '2026-07-04T18:30:00.000Z');
});

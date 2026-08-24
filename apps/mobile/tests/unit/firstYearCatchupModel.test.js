import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCatchupProgress,
  buildSavedDayCounts,
  firstYearTargetBand,
  localDayInTimeZone,
  recommendedNightlySize,
} from '../../src/firstYearCatchupModel.js';

test('adaptive pacing remains a calm bounded set and never pads a short backlog', () => {
  assert.equal(recommendedNightlySize({ eligibleCount: 2, uncoveredDayCount: 2 }), 2);
  assert.equal(recommendedNightlySize({ eligibleCount: 12, completedSessionCount: 0 }), 3);
  assert.equal(recommendedNightlySize({ eligibleCount: 80, completedSessionCount: 1 }), 5);
  assert.equal(recommendedNightlySize({ eligibleCount: 5000, completedSessionCount: 3 }), 7);
  assert.equal(recommendedNightlySize({ eligibleCount: 5000, completedSessionCount: 20, continuation: true }), 3);
});

test('family-union saved moments become timezone-stable day facts without media identifiers', () => {
  const counts = buildSavedDayCounts([
    { captured_at: '2026-07-20T01:30:00Z' },
    { captured_at: '2026-07-20T02:30:00Z' },
    { captured_at: '2026-07-20T16:00:00Z' },
  ], 'America/New_York');
  assert.deepEqual([...counts.entries()], [['2026-07-19', 2], ['2026-07-20', 1]]);
});

test('first-year range is a reporting band rather than a destructive cap', () => {
  assert.deepEqual(firstYearTargetBand(365), { lower: 464, upper: 566 });
  const progress = buildCatchupProgress({
    elapsedDays: 365,
    savedPhotoDays: 240,
    savedMemoryCount: 510,
    eligibleCount: 32,
    uncoveredEligibleDayCount: 18,
  });
  assert.equal(progress.hasMore, true);
  assert.equal(progress.savedMemoryCount, 510);
  assert.equal(progress.targetBand.upper, 566);
});

test('limited library progress is explicit and does not claim complete coverage', () => {
  const progress = buildCatchupProgress({ elapsedDays: 100, accessPrivileges: 'limited' });
  assert.equal(progress.limited, true);
  assert.match(progress.accessNote, /only.*photos you selected/i);
});

test('nightly local day follows the named timezone across UTC rollover and DST', () => {
  const instant = new Date('2026-03-08T04:30:00Z');
  assert.equal(localDayInTimeZone(instant, 'America/New_York'), '2026-03-07');
  assert.equal(localDayInTimeZone(instant, 'Europe/London'), '2026-03-08');
  assert.equal(localDayInTimeZone('2026-11-01T05:30:00Z', 'America/New_York'), '2026-11-01');
});

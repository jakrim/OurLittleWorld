import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import {
  buildMomentDayDetailRows,
  buildMomentDayIndexRows,
  utcRangeForLocalDay,
} from '../../src/momentDayIndexModel.js';

test('5,000 saved moments build a 365-day lightweight index without rich graphs', () => {
  const start = Date.UTC(2025, 6, 23, 16);
  const moments = Array.from({ length: 5000 }, (_, index) => ({
    id: `moment-${index}`,
    captured_at: new Date(start + (index % 365) * 86400000).toISOString(),
  }));
  const mediaRows = moments.flatMap((moment, index) => [{
    id: `media-${index}`,
    moment_id: moment.id,
    media_type: index % 13 === 0 ? 'video' : 'image',
    sort_order: 0,
    metadata: { thumbPath: `fixture/${index}.jpg` },
  }]);
  const started = performance.now();
  const days = buildMomentDayIndexRows({ moments, mediaRows, timezone: 'America/New_York' });
  const durationMs = performance.now() - started;

  console.info(`release2-performance moment_day_index_5000_ms=${durationMs.toFixed(1)} day_rows=${days.length} signed_cover_bound=${days.length}`);
  assert.equal(days.length, 365);
  assert.equal(days.reduce((sum, day) => sum + day.imageCount + day.videoCount, 0), 5000);
  assert.ok(days.every((day) => Object.keys(day).length <= 7));
  assert.ok(durationMs < 500, `day index took ${durationMs.toFixed(1)}ms`);
});

test('same-day standouts remain individually browsable', () => {
  const moments = [
    { id: 'morning', captured_at: '2026-07-20T13:00:00.000Z' },
    { id: 'evening', captured_at: '2026-07-20T23:00:00.000Z' },
  ];
  const mediaRows = [
    { id: 'photo-a', moment_id: 'morning', media_type: 'image', sort_order: 0, metadata: { thumbPath: 'a.jpg' } },
    { id: 'photo-b', moment_id: 'evening', media_type: 'image', sort_order: 0, metadata: { thumbPath: 'b.jpg' } },
    { id: 'video-b', moment_id: 'evening', media_type: 'video', sort_order: 1, metadata: { posterPath: 'b-video.jpg' } },
  ];
  const rows = buildMomentDayDetailRows({ moments, mediaRows });
  assert.deepEqual(rows.map((row) => row.momentId), ['evening', 'morning']);
  assert.deepEqual(rows.map((row) => [row.imageCount, row.videoCount]), [[1, 1], [1, 0]]);
  assert.deepEqual(rows.map((row) => row.coverPath), ['b.jpg', 'a.jpg']);
});

test('local-day UTC bounds honor DST without moving memories to another day', () => {
  const spring = utcRangeForLocalDay('2026-03-08', 'America/New_York');
  const fall = utcRangeForLocalDay('2026-11-01', 'America/New_York');
  assert.equal((new Date(spring.end) - new Date(spring.start)) / 3600000, 23);
  assert.equal((new Date(fall.end) - new Date(fall.start)) / 3600000, 25);
  assert.equal(spring.start, '2026-03-08T05:00:00.000Z');
  assert.equal(fall.start, '2026-11-01T04:00:00.000Z');
});

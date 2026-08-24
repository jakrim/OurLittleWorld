import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import {
  buildDailyCurationPlan,
  buildSavedDailyAlbum,
  dailyArchiveRecordsFromMoments,
} from '../../src/dailyCurationModel.js';

function photo(id, day, quality, extra = {}) {
  return {
    assetId: id,
    mediaType: 'image',
    score: 0.9,
    captureQuality: quality,
    creationTime: new Date(`${day}T12:00:00`).getTime(),
    featureVector: [quality, 1 - quality, Number(id.replace(/\D/g, '') || 0) / 100],
    visualFingerprint: [1, 0, 0],
    ...extra,
  };
}

test('a 5,000-photo first-year library yields one anchor for every eligible day', () => {
  const matches = [];
  const start = new Date(2025, 6, 23, 12);
  for (let day = 0; day < 365; day += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + day);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    for (let shot = 0; shot < 14; shot += 1) {
      matches.push(photo(`${day}-${shot}`, key, shot / 14, {
        creationTime: new Date(`${key}T12:00:${String(shot).padStart(2, '0')}`).getTime(),
        featureVector: [1, 0, 0],
      }));
    }
  }
  const plan = buildDailyCurationPlan(matches);

  assert.equal(matches.length, 5110);
  assert.equal(plan.photoDayCount, 365);
  assert.equal(plan.photoCount, 365);
});

test('a weak eligible day still gets one anchor instead of disappearing', () => {
  const plan = buildDailyCurationPlan([
    photo('only', '2026-07-16', 0.12, { score: 0.64 }),
  ]);

  assert.equal(plan.photoCount, 1);
  assert.equal(plan.selectedMatches[0].curation.role, 'daily-anchor');
});

test('review curation does not preselect an uncertain identity', () => {
  const plan = buildDailyCurationPlan([
    photo('uncertain', '2026-07-16', 0.9, { score: 0.79 }),
    photo('clear', '2026-07-17', 0.7, { score: 0.8 }),
  ], { minIdentityScore: 0.8 });

  assert.deepEqual(plan.selectedMatches.map((match) => match.assetId), ['clear']);
});

test('all distinct standout and likely-smile photos survive on the same day without an arbitrary cap', () => {
  const matches = Array.from({ length: 30 }, (_, index) => photo(
    `smile-${index}`,
    '2026-07-16',
    0.8,
    {
      smileScore: 0.9,
      creationTime: new Date('2026-07-16T08:00:00').getTime() + index * 15 * 60 * 1000,
      featureVector: [index / 10, 1 - index / 10, 0.5],
      visualFingerprint: Array.from({ length: 30 }, (_, slot) => Number(slot === index)),
    },
  ));
  const plan = buildDailyCurationPlan(matches);

  assert.equal(plan.photoCount, 30);
  assert.equal(plan.days[0].photos.filter((item) => item.curation.reason === 'likely-smile').length, 29);
});

test('special videos use across-video evidence and remain separate from the daily photo', () => {
  const plan = buildDailyCurationPlan([
    photo('anchor', '2026-07-16', 0.8),
    {
      ...photo('video', '2026-07-16', 0.7),
      mediaType: 'video',
      duration: 12000,
      videoPresenceRatio: 2 / 3,
    },
    {
      ...photo('fleeting-video', '2026-07-16', 0.7),
      mediaType: 'video',
      duration: 12000,
      videoPresenceRatio: 1 / 3,
      score: 0.75,
    },
  ]);

  assert.equal(plan.photoCount, 1);
  assert.equal(plan.videoCount, 1);
  assert.equal(plan.days[0].videos[0].assetId, 'video');
});

test('first-year coverage uses local calendar days for the July 23 birthday', () => {
  const album = buildSavedDailyAlbum([
    { key: 'one', capturedAt: '2025-07-23T12:00:00', imageCount: 1, videoCount: 0 },
    { key: 'two', capturedAt: '2026-07-16T12:00:00', imageCount: 1, videoCount: 0 },
    { key: 'note', capturedAt: '2025-07-24T12:00:00', imageCount: 0, videoCount: 0 },
    { key: 'undated-video', imageCount: 0, videoCount: 1 },
  ], {
    babyBirthday: '2025-07-23',
    now: new Date(2026, 6, 16, 12),
  });

  assert.equal(album.firstYearElapsedDays, 359);
  assert.equal(album.firstYearPhotoDays, 2);
  assert.equal(album.savedDayCount, 2);
  assert.equal(album.firstYearDays.length, 359);
  assert.equal(album.firstYearDays[0].dayKey, '2026-07-16');
  assert.equal(album.firstYearDays[0].dayNumber, 359);
  assert.equal(album.firstYearDays.at(-1).dayKey, '2025-07-23');
  assert.equal(album.firstYearDays.find((day) => day.dayKey === '2025-07-24').records.length, 0);
  assert.deepEqual(album.firstYearTargetBand, { lower: 456, upper: 556 });
});

test('5,000 lightweight saved moments group into a virtualizable 365-day model quickly', () => {
  const start = new Date(2025, 6, 23, 12);
  const records = Array.from({ length: 5000 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + (index % 365));
    return {
      key: `saved-${index}`,
      capturedAt: date.toISOString(),
      imageCount: index % 11 === 0 ? 0 : 1,
      videoCount: index % 11 === 0 ? 1 : 0,
    };
  });
  const started = performance.now();
  const album = buildSavedDailyAlbum(records, {
    babyBirthday: '2025-07-23',
    now: new Date(2026, 6, 22, 12),
    recentLimit: 365,
  });
  const durationMs = performance.now() - started;

  console.info(`release2-performance saved_album_5000_ms=${durationMs.toFixed(1)} day_models=${album.days.length} record_count=${album.savedMemoryCount}`);
  assert.equal(album.days.length, 365);
  assert.equal(album.savedMemoryCount, 5000);
  assert.ok(durationMs < 500, `saved album grouping took ${durationMs.toFixed(1)}ms`);
});

test('saved moments become lightweight daily records without losing playable media counts', () => {
  const [record] = dailyArchiveRecordsFromMoments([{
    id: 'moment',
    captured_at: '2026-07-16T12:00:00',
    media: [
      { media_type: 'image', thumbUrl: 'thumb' },
      { media_type: 'video', posterUrl: 'poster', fullUrl: 'video' },
    ],
  }]);

  assert.equal(record.imageCount, 1);
  assert.equal(record.videoCount, 1);
  assert.equal(record.thumbUrl, 'thumb');
  assert.equal(record.moment.id, 'moment');
});

test('first-year day numbers use calendar dates instead of daylight-saving-hour math', () => {
  const album = buildSavedDailyAlbum([], {
    babyBirthday: '2026-03-07',
    now: new Date(2026, 2, 10, 12),
  });

  assert.equal(album.firstYearElapsedDays, 4);
  assert.equal(album.firstYearDays[0].dayNumber, 4);
});

test('saved day grouping follows the family timezone instead of the current device timezone', () => {
  const records = [{ key: 'late', capturedAt: '2026-07-20T03:30:00Z', imageCount: 1, videoCount: 0 }];
  const newYork = buildSavedDailyAlbum(records, { timezone: 'America/New_York' });
  const london = buildSavedDailyAlbum(records, { timezone: 'Europe/London' });
  assert.equal(newYork.days[0].dayKey, '2026-07-19');
  assert.equal(london.days[0].dayKey, '2026-07-20');
});

test('elapsed first-year day follows the family timezone at midnight rollover', () => {
  const now = new Date('2026-07-20T01:00:00.000Z');
  const newYork = buildSavedDailyAlbum([], {
    babyBirthday: '2026-07-19',
    now,
    timezone: 'America/New_York',
  });
  const london = buildSavedDailyAlbum([], {
    babyBirthday: '2026-07-19',
    now,
    timezone: 'Europe/London',
  });
  assert.equal(newYork.firstYearElapsedDays, 1);
  assert.equal(london.firstYearElapsedDays, 2);
});

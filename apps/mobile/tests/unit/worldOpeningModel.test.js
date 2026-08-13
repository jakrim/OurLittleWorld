import assert from 'node:assert/strict';
import test from 'node:test';

import { prioritizeImmediateKeepForOpening, selectWorldOpening } from '../../src/worldOpeningModel.js';

test('Our World opens on the latest renderable memory and preserves recent continuity', () => {
  const records = [
    { key: 'text-only', moment: { media: [] } },
    {
      key: 'latest-photo',
      capturedAt: '2026-08-09T12:00:00Z',
      moment: { author_user_id: 'parent-1', media: [{ media_type: 'image', thumbUrl: 'https://example.test/latest.jpg' }] },
    },
    {
      key: 'video',
      capturedAt: '2026-07-01T12:00:00Z',
      moment: { media: [{ media_type: 'video', posterUrl: 'https://example.test/video.jpg' }] },
    },
  ];
  const opening = selectWorldOpening(records, { 'parent-1': 'Parent' });

  assert.equal(opening.primary.record.key, 'latest-photo');
  assert.equal(opening.primary.author, 'Parent');
  assert.equal(opening.continuity[0].record.key, 'video');
  assert.equal(opening.visualCount, 2);
});

test('Our World does not promote text-only utilities as its visual opening', () => {
  assert.deepEqual(selectWorldOpening([{ key: 'text-only', moment: { media: [] } }]), {
    primary: null,
    continuity: [],
    visualCount: 0,
  });
});

test('video openings use a poster and never send playback URLs to Image', () => {
  const opening = selectWorldOpening([
    {
      key: 'video-with-poster',
      moment: { media: [{
        media_type: 'video',
        fullUrl: 'https://playback.test/video.m3u8',
        posterUrl: 'https://images.test/video.jpg',
      }] },
    },
  ]);
  assert.equal(opening.primary.mediaUri, 'https://images.test/video.jpg');
  assert.equal(opening.primary.mediaType, 'video');
});

test('a posterless playback-only video yields to the next truthful visual', () => {
  const opening = selectWorldOpening([
    {
      key: 'playback-only',
      thumbUrl: 'https://playback.test/video.m3u8',
      videoCount: 1,
      moment: { media: [{ media_type: 'video', fullUrl: 'https://playback.test/video.m3u8' }] },
    },
    {
      key: 'photo',
      moment: { media: [{ media_type: 'image', fullUrl: 'https://images.test/photo.jpg' }] },
    },
  ]);
  assert.equal(opening.primary.record.key, 'photo');
  assert.equal(opening.primary.mediaUri, 'https://images.test/photo.jpg');
});

test('Our World opens on one immediate historical Keep beyond 500 newer captures without rewriting its date', () => {
  const chronologicalArchive = Array.from({ length: 500 }, (_, index) => ({
    key: `recent-${index}`,
    capturedAt: new Date(Date.UTC(2026, 7, 12, 12, 0, index)).toISOString(),
    moment: { media: [{ media_type: 'image', thumbUrl: `https://example.test/recent-${index}.jpg` }] },
  }));
  const historicalKeep = {
    key: 'moment:historical-keep',
    capturedAt: '2024-01-03T09:15:00.000Z',
    moment: {
      id: 'historical-keep',
      author_user_id: 'parent-b',
      media: [{ media_type: 'image', thumbUrl: 'https://example.test/historical.jpg' }],
    },
  };

  const openingOnly = prioritizeImmediateKeepForOpening(chronologicalArchive, historicalKeep);
  const opening = selectWorldOpening(openingOnly, { 'parent-b': 'Parent' });
  assert.equal(opening.primary.record.key, 'moment:historical-keep');
  assert.equal(opening.primary.capturedAt.toISOString(), '2024-01-03T09:15:00.000Z');
  assert.equal(opening.primary.author, 'Parent');
  assert.deepEqual(chronologicalArchive.map((record) => record.key), Array.from({ length: 500 }, (_, index) => `recent-${index}`));
});

test('an unavailable immediate Keep cannot hide the next truthful Our World visual', () => {
  const archive = [{
    key: 'ready-photo',
    moment: { media: [{ media_type: 'image', thumbUrl: 'https://example.test/ready.jpg' }] },
  }];
  const unavailable = {
    key: 'unavailable',
    moment: { media: [{ media_type: 'video', fullUrl: 'https://playback.test/unavailable.m3u8' }] },
  };
  const opening = selectWorldOpening(prioritizeImmediateKeepForOpening(archive, unavailable));
  assert.equal(opening.primary.record.key, 'ready-photo');
});

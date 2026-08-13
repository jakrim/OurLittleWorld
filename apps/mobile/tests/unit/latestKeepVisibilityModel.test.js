import assert from 'node:assert/strict';
import test from 'node:test';

import {
  latestReadyTaggedRow,
  mergeLatestReadyTaggedRow,
} from '../../src/latestKeepVisibilityModel.js';
import { selectPhotoFirstHome } from '../../src/photoFirstHomeModel.js';

function capturedRow(index) {
  return {
    family_id: 'family-a',
    asset_owner_user_id: 'parent-a',
    asset_id: `recent-${index}`,
    upload_status: 'ready',
    creation_time: new Date(Date.UTC(2026, 7, 12, 12, 0, index)).toISOString(),
    tagged_at: new Date(Date.UTC(2026, 7, 10, 12, 0, index)).toISOString(),
    thumbUrl: `https://example.test/recent-${index}.jpg`,
  };
}

test('Today still shows a newly kept historical memory beyond 120 newer-captured rows', () => {
  const bounded = Array.from({ length: 120 }, (_, index) => capturedRow(index));
  const historicalKeep = {
    family_id: 'family-a',
    asset_owner_user_id: 'parent-b',
    asset_id: 'historical-keep',
    moment_id: 'historical-moment',
    upload_status: 'ready',
    creation_time: '2024-01-03T09:15:00.000Z',
    tagged_at: '2026-08-12T20:00:00.000Z',
    thumbUrl: 'https://example.test/historical-keep.jpg',
  };

  const merged = mergeLatestReadyTaggedRow(bounded, historicalKeep);
  assert.equal(merged.length, 121);
  assert.deepEqual(merged.slice(0, 120), bounded);
  assert.equal(latestReadyTaggedRow(merged), historicalKeep);

  const home = selectPhotoFirstHome({ sharedPhotos: merged });
  assert.equal(home.momentId, 'historical-moment');
  assert.equal(home.mediaUri, 'https://example.test/historical-keep.jpg');
  assert.equal(home.capturedAt.toISOString(), '2024-01-03T09:15:00.000Z');
});

test('not-ready and invalid latest rows cannot displace a bounded ready archive', () => {
  const bounded = [capturedRow(0)];
  for (const upload_status of ['uploading', 'failed', 'pending']) {
    const candidate = {
      ...capturedRow(1),
      asset_id: `not-ready-${upload_status}`,
      upload_status,
      tagged_at: '2026-08-12T23:59:00.000Z',
    };
    assert.deepEqual(mergeLatestReadyTaggedRow(bounded, candidate), bounded);
    assert.equal(latestReadyTaggedRow([...bounded, candidate]), bounded[0]);
  }
  assert.deepEqual(mergeLatestReadyTaggedRow(bounded, { upload_status: 'ready' }), bounded);
});

test('a co-parent latest Keep is selected family-wide and deduplicated', () => {
  const existing = capturedRow(0);
  const coParentUpdate = {
    ...existing,
    asset_owner_user_id: 'parent-b',
    asset_id: 'co-parent-photo',
    tagged_at: '2026-08-12T21:00:00.000Z',
  };
  const once = mergeLatestReadyTaggedRow([existing], coParentUpdate);
  const twice = mergeLatestReadyTaggedRow(once, { ...coParentUpdate, thumbUrl: 'https://example.test/refreshed.jpg' });
  assert.equal(twice.length, 2);
  assert.equal(latestReadyTaggedRow(twice).asset_owner_user_id, 'parent-b');
  assert.equal(latestReadyTaggedRow(twice).thumbUrl, 'https://example.test/refreshed.jpg');
});

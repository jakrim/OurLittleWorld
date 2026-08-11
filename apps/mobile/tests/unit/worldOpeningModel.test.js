import assert from 'node:assert/strict';
import test from 'node:test';

import { selectWorldOpening } from '../../src/worldOpeningModel.js';

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

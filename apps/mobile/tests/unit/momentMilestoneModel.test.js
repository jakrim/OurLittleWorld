import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMomentMilestoneRoute,
  milestoneDateSourceCaption,
  shouldLockMilestoneDate,
} from '../../src/momentMilestoneModel.js';

test('a moment opens an unsaved milestone draft seeded with its date, text, and photo', () => {
  const route = buildMomentMilestoneRoute({
    moment: {
      id: 'moment-1',
      title: 'Crawling across the room',
      caption_note: 'He made it to the toy basket.',
      captured_at: '2026-07-11T15:30:00.000Z',
    },
    media: {
      local_identifier: 'asset-1',
      owner_user_id: 'parent-1',
      fullUrl: 'https://private.example/photo.jpg',
    },
  });

  assert.deepEqual(route, {
    pathname: '/first-compose',
    params: {
      momentId: 'moment-1',
      sourceMomentId: 'moment-1',
      title: 'Crawling across the room',
      seedNote: 'He made it to the toy basket.',
      seedDate: '2026-07-11',
      seedAssetId: 'asset-1',
      seedAssetOwnerUserId: 'parent-1',
      seedAssetUri: 'https://private.example/photo.jpg',
    },
  });
  assert.equal('id' in route.params, false);
});

test('an existing linked milestone reopens without creating a replacement', () => {
  const route = buildMomentMilestoneRoute({
    moment: { id: 'moment-1', captured_at: '2026-07-11T15:30:00.000Z' },
    existingFirst: { id: 'first-1' },
  });

  assert.equal(route.params.id, 'first-1');
  assert.equal(route.params.seedDate, '2026-07-11');
  assert.equal(route.params.title, undefined);
});

test('a linked moment date is fixed and described as inherited', () => {
  assert.equal(shouldLockMilestoneDate({ sourceMomentId: 'moment-1', happenedDate: '2026-07-11' }), true);
  assert.equal(shouldLockMilestoneDate({ sourceMomentId: null, happenedDate: '2026-07-11' }), false);
  assert.equal(
    milestoneDateSourceCaption({ ageCaption: "Reuben's age on this date: 11 months, 18 days." }),
    "Date from this saved moment. Reuben's age on this date: 11 months, 18 days.",
  );
});

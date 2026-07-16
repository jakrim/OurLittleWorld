import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FAMILY_LIBRARY_PRIVACY_COPY,
  buildFamilyLibrarySyncModel,
} from '../../src/familyLibrarySyncModel.js';

const members = [
  { userId: 'a', displayName: 'Jesse Krim', role: 'creator' },
  { userId: 'b', displayName: 'Lauren Krim', role: 'partner' },
  { userId: 'c', displayName: 'Grandma', role: 'circle' },
];

test('each parent owns a separate photo-library connection', () => {
  const model = buildFamilyLibrarySyncModel({
    members,
    currentUserId: 'a',
    connections: [{ user_id: 'a', status: 'ready', last_success_at: '2026-07-16T12:00:00Z' }],
    now: new Date('2026-07-16T14:00:00Z'),
  });

  assert.equal(model.parents.length, 2);
  assert.equal(model.parents[0].detail, 'Last checked today.');
  assert.equal(model.parents[1].detail, 'Lauren chooses access independently on their phone.');
  assert.equal(model.parents[0].canScan, true);
  assert.equal(model.parents[1].canScan, false);
  assert.match(FAMILY_LIBRARY_PRIVACY_COPY, /Only saved memories enter Our World/);
});

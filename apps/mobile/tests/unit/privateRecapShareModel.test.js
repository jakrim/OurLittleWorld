import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PRIVATE_RECAP_ACCESS_MODEL,
  buildPrivateBookPreviewSharePayload,
  buildPrivateDigestSharePayload,
} from '../../src/privateRecapShareModel.js';

test('private book preview share payload exposes selected summary without public links', () => {
  const payload = buildPrivateBookPreviewSharePayload({
    family: { babyName: 'Mina' },
    childId: 'child-a',
    stats: { moments: 4, photos: 7, videos: 1, voiceNotes: 2, firsts: 1 },
    years: [{ year: 2026, moments: 4, photos: 7, videos: 1, voiceNoteCount: 2 }],
  });

  assert.equal(payload.access.publicLinksEnabled, false);
  assert.equal(payload.childId, 'child-a');
  assert.equal(payload.childScoped, true);
  assert.equal(payload.access.selectedContentOnly, true);
  assert.equal(payload.access.fullAppAccessShared, false);
  assert.match(payload.message, /Private book preview for Mina/);
  assert.match(payload.message, /not a feed or app invite/);
  assert.match(payload.message, /only this selected book-preview summary/);
  assert.match(payload.message, /No public link is created/);
  assert.doesNotMatch(payload.message, /child-a/);
  assert.doesNotMatch(payload.message, /https?:\/\//);
});

test('private digest share payload names selected weekly recap only', () => {
  const payload = buildPrivateDigestSharePayload({
    family: { babyName: 'Mina' },
    digest: { weekStart: '2026-07-06', weekEnd: '2026-07-12', momentCount: 3, firstsCount: 1 },
  });

  assert.equal(payload.access, PRIVATE_RECAP_ACCESS_MODEL);
  assert.match(payload.message, /Private weekly recap for Mina/);
  assert.match(payload.message, /only this selected weekly recap/);
  assert.match(payload.message, /3 saved moments and 1 first/);
  assert.match(payload.message, /not a feed or app invite/);
  assert.doesNotMatch(payload.message, /full app|archive-wide/i);
});

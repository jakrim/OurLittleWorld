import assert from 'node:assert/strict';
import { test } from 'node:test';

import { digestHasContent, distinctDigestRepresentativeMedia } from '../../src/digestModel.js';

test('empty weekly digests are hidden on Today', () => {
  assert.equal(
    digestHasContent({
      momentCount: 0,
      milestoneCount: 0,
      voiceNoteCount: 0,
      letterCount: 0,
    }),
    false,
  );
});

test('any digest content keeps the Today digest card visible', () => {
  assert.equal(digestHasContent({ momentCount: 1 }), true);
  assert.equal(digestHasContent({ milestoneCount: 1 }), true);
  assert.equal(digestHasContent({ voiceNoteCount: 1 }), true);
  assert.equal(digestHasContent({ letterCount: 1 }), true);
  assert.equal(digestHasContent({ photoCount: 1 }), true);
  assert.equal(digestHasContent({ firstsCount: 1 }), true);
});

test('weekly recap keeps one representative per saved event', () => {
  const media = distinctDigestRepresentativeMedia([
    { mediaId: 'a', momentId: 'event-1' },
    { mediaId: 'b', momentId: 'event-1' },
    { mediaId: 'c', momentId: 'event-2' },
    { mediaId: 'd', momentId: 'event-3' },
    { mediaId: 'e', momentId: 'event-4' },
    { mediaId: 'f', momentId: 'event-5' },
  ]);

  assert.deepEqual(media.map((item) => item.mediaId), ['a', 'c', 'd', 'e']);
});

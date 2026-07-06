import assert from 'node:assert/strict';
import { test } from 'node:test';

import { digestHasContent } from '../../src/digestModel.js';

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

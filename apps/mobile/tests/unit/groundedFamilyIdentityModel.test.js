import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  groundedFirstLookCopy,
  groundedMemoryAuthorLabel,
} from '../../src/groundedFamilyIdentityModel.js';

test('memory shares preserve an author name only when member metadata provides it', () => {
  assert.equal(groundedMemoryAuthorLabel({
    authorUserId: 'parent_b',
    currentUserId: 'parent_a',
    membersById: { parent_b: 'Sam Rivera' },
  }), 'Sam Rivera');
});

test('memory shares use neutral relationship labels when author metadata is missing', () => {
  assert.equal(groundedMemoryAuthorLabel({
    authorUserId: 'parent_a',
    currentUserId: 'parent_a',
  }), 'You');
  assert.equal(groundedMemoryAuthorLabel({
    authorUserId: 'parent_b',
    currentUserId: 'parent_a',
  }), 'Your co-parent');
  assert.equal(groundedMemoryAuthorLabel(), '');
});

test('First Look preserves a real creator name and otherwise stays occasion-neutral', () => {
  assert.deepEqual(groundedFirstLookCopy({ creatorDisplayName: 'Sam Rivera' }), {
    eyebrow: 'Your shared family world',
    creatorName: 'Sam Rivera',
  });
  assert.deepEqual(groundedFirstLookCopy(), {
    eyebrow: 'Your shared family world',
    creatorName: 'Your co-parent',
  });
});

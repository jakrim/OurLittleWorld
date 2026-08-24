import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatTagLabel, normalizeMomentTags } from '../../src/tagModel.js';

test('moment tags trim, lowercase, remove leading hashes, and dedupe', () => {
  assert.deepEqual(
    normalizeMomentTags([' First ', 'first', '#FIRST', '  little laugh  ', '', null]),
    ['first', 'little laugh'],
  );
});

test('tag labels render capitalized from normalized tags', () => {
  assert.equal(formatTagLabel('first'), 'First');
  assert.equal(formatTagLabel('little laugh'), 'Little laugh');
});

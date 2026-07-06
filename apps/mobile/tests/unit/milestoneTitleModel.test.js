import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatMilestoneDisplayTitle } from '../../src/milestoneTitleModel.js';

test('milestone teaser display title is sentence-cased', () => {
  assert.equal(formatMilestoneDisplayTitle('Reuben Crawled today!'), 'Reuben crawled today!');
  assert.equal(formatMilestoneDisplayTitle('  FIRST WORD  '), 'First word');
});

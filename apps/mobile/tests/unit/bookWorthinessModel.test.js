import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildBookWorthinessForMoment,
  sortBookHighlightCandidates,
} from '../../src/bookWorthinessModel.js';

test('auto-saved photos can stay archived without becoming book highlights', () => {
  const state = buildBookWorthinessForMoment({
    id: 'auto-1',
    title: '',
    caption_note: '',
    tags: [],
    media: [
      { media_type: 'image', metadata: { source: 'scan-auto-save', captureQuality: 0.91 } },
    ],
  });

  assert.equal(state.savedToArchive, true);
  assert.equal(state.bookEligible, false);
  assert.equal(state.archiveStatusLabel, 'Saved in archive');
  assert.equal(state.bookStatusLabel, 'Saved in archive');
  assert.ok(state.reasons.includes('archive-only-auto-save'));
});

test('parent-kept moments are eligible book highlights', () => {
  const state = buildBookWorthinessForMoment({
    id: 'review-1',
    title: '',
    caption_note: '',
    tags: [],
    media: [
      { media_type: 'image', metadata: { source: 'library-review', captureQuality: 0.7 } },
    ],
  });

  assert.equal(state.bookEligible, true);
  assert.ok(state.reasons.includes('parent-kept'));
});

test('auto-saved moments can become book-ready when a parent adds context', () => {
  const state = buildBookWorthinessForMoment({
    id: 'auto-context',
    title: 'Kitchen giggles',
    caption_note: 'A real parent note.',
    tags: [],
    media: [
      { media_type: 'image', metadata: { source: 'scan-auto-save', captureQuality: 0.91 } },
    ],
  });

  assert.equal(state.bookEligible, true);
  assert.ok(state.reasons.includes('context'));
});

test('highlight sorting prefers book score before recency', () => {
  const sorted = sortBookHighlightCandidates([
    { id: 'new-low', bookScore: 20, capturedAt: '2026-07-09T12:00:00Z' },
    { id: 'old-high', bookScore: 80, capturedAt: '2026-07-01T12:00:00Z' },
  ]);

  assert.deepEqual(sorted.map((item) => item.id), ['old-high', 'new-low']);
});

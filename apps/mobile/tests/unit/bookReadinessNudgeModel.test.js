import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MONTH_READINESS_MEDIA_MIN,
  scoreMomentBookReadiness,
  scoreMonthBookReadiness,
  selectBookReadinessNudge,
} from '../../src/bookReadinessNudgeModel.js';

test('moment readiness requires media and durable context', () => {
  const ready = scoreMomentBookReadiness(momentRecord('m-ready', {
    title: 'Kitchen helper',
    imageCount: 1,
  }));

  assert.equal(ready.bookReady, true);
  assert.equal(ready.state, 'ready');
  assert.deepEqual(ready.durableContextKinds, ['title']);
  assert.equal(ready.hasEnoughMedia, true);
  assert.equal(ready.hasDurableContext, true);

  const mediaOnly = scoreMomentBookReadiness(momentRecord('m-media', { imageCount: 1 }));
  assert.equal(mediaOnly.bookReady, false);
  assert.equal(mediaOnly.state, 'needs_context');
  assert.equal(mediaOnly.durableContextCount, 0);

  const contextOnly = scoreMomentBookReadiness(momentRecord('m-voice', {
    voiceCount: 1,
  }));
  assert.equal(contextOnly.bookReady, false);
  assert.equal(contextOnly.state, 'needs_media');
  assert.deepEqual(contextOnly.durableContextKinds, ['voice']);
});

test('moment readiness counts linked firsts, prompt answers, and letters as context', () => {
  const score = scoreMomentBookReadiness(momentRecord('m-linked', {
    imageCount: 1,
  }), {
    contextItems: [
      { kind: 'first', momentId: 'm-linked', title: 'First wave' },
      { kind: 'prompt', momentId: 'm-linked', title: 'What changed today?' },
      { kind: 'letter', momentId: 'other', title: 'Other letter' },
    ],
  });

  assert.equal(score.bookReady, true);
  assert.deepEqual(score.durableContextKinds, ['first', 'prompt']);
});

test('month readiness requires enough media and at least one durable context item', () => {
  const chapter = {
    title: 'July 2026',
    photos: MONTH_READINESS_MEDIA_MIN,
    videos: 0,
    records: [
      momentRecord('m-1', { imageCount: 1 }),
      momentRecord('m-2', { imageCount: 1 }),
      momentRecord('m-3', { imageCount: 1 }),
    ],
    contextItems: [],
  };

  const needsContext = scoreMonthBookReadiness(chapter);
  assert.equal(needsContext.bookReady, false);
  assert.equal(needsContext.state, 'needs_context');
  assert.equal(needsContext.hasEnoughMedia, true);
  assert.equal(needsContext.durableContextCount, 0);

  const ready = scoreMonthBookReadiness({
    ...chapter,
    contextItems: [{ kind: 'prompt', title: 'Prompt answered', capturedAt: '2026-07-02' }],
  });
  assert.equal(ready.bookReady, true);
  assert.equal(ready.state, 'ready');
  assert.equal(ready.hasDurableContext, true);

  const collecting = scoreMonthBookReadiness({
    ...chapter,
    photos: 1,
    records: [momentRecord('m-1', { imageCount: 1, title: 'Bath' })],
    contextItems: [],
  });
  assert.equal(collecting.bookReady, false);
  assert.equal(collecting.state, 'collecting');
});

test('selector returns one gentle Today nudge for a current month that only needs context', () => {
  const nudge = selectBookReadinessNudge({
    chapters: [
      {
        title: 'July 2026',
        photos: 3,
        videos: 0,
        records: [
          momentRecord('older', { imageCount: 1, capturedAt: '2026-07-01T12:00:00Z' }),
          momentRecord('newer', { imageCount: 1, capturedAt: '2026-07-03T12:00:00Z' }),
          momentRecord('middle', { imageCount: 1, capturedAt: '2026-07-02T12:00:00Z' }),
        ],
        contextItems: [],
      },
    ],
  });

  assert.equal(nudge.eyebrow, 'Book');
  assert.equal(nudge.title, 'Add one line to make July easier to remember');
  assert.deepEqual(nudge.route, { pathname: '/moment/[momentId]', params: { momentId: 'newer' } });
});

test('selector stays quiet when the month is already book-ready or empty', () => {
  assert.equal(selectBookReadinessNudge({ chapters: [] }), null);
  assert.equal(selectBookReadinessNudge({
    chapters: [
      {
        title: 'July 2026',
        photos: 3,
        records: [momentRecord('m-ready', { imageCount: 3, title: 'Pool day' })],
        contextItems: [],
      },
    ],
  }), null);
});

test('nudge copy avoids pressure and invented-memory language', () => {
  const nudge = selectBookReadinessNudge({
    records: [momentRecord('m-copy', { imageCount: 1 })],
  });

  assert.equal(nudge.title, 'Add one line to make this moment easier to remember');
  assert.doesNotMatch(nudge.title, /behind|missing|overdue|complete|must|should/i);
  assert.doesNotMatch(nudge.title, /loved|felt|wanted|said|first ever/i);
});

function momentRecord(id, overrides = {}) {
  const capturedAt = overrides.capturedAt || '2026-07-01T12:00:00Z';
  const moment = {
    id,
    title: overrides.title || '',
    caption_note: overrides.captionNote || '',
    captured_at: capturedAt,
    created_at: capturedAt,
    tags: overrides.tags || [],
    media: [],
    voiceNotes: [],
  };
  return {
    key: `moment:${id}`,
    id,
    moment,
    title: overrides.title || '',
    capturedAt,
    imageCount: overrides.imageCount || 0,
    videoCount: overrides.videoCount || 0,
    voiceCount: overrides.voiceCount || 0,
    tags: overrides.tags || [],
  };
}

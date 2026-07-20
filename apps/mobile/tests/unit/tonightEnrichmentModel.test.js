import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTonightCommitPlan,
  summarizeTonightCompletion,
  tonightReactionCodes,
} from '../../src/tonightEnrichmentModel.js';

test('text, voice, favorite and reaction produce explicit independent commit steps', () => {
  const item = {
    draftText: 'The blue blanket',
    draftVoice: { uri: 'file:///private/draft.m4a' },
    favorite: true,
    reactionCode: 'spark',
    commitSteps: { media: 'saved', text: 'idle', voice: 'failed', reaction: 'idle' },
  };
  assert.deepEqual(buildTonightCommitPlan(item), [
    { key: 'media', needed: true, complete: true },
    { key: 'text', needed: true, complete: false },
    { key: 'voice', needed: true, complete: false },
    { key: 'reaction', needed: true, complete: false },
  ]);
  assert.deepEqual(tonightReactionCodes(item), ['heart', 'spark']);
});

test('empty enrichment is skipped rather than manufactured', () => {
  const plan = buildTonightCommitPlan({ commitSteps: {} });
  assert.deepEqual(plan.map(({ key, needed }) => [key, needed]), [
    ['media', true], ['text', false], ['voice', false], ['reaction', false],
  ]);
});

test('completion summary is factual and counts only confirmed saved enrichment', () => {
  assert.deepEqual(summarizeTonightCompletion([
    { state: 'kept', commitSteps: { text: 'saved', voice: 'saved', reaction: 'skipped' } },
    { state: 'kept', commitSteps: { text: 'skipped', voice: 'skipped', reaction: 'saved' } },
    { state: 'skipped', commitSteps: { text: 'idle', voice: 'idle', reaction: 'idle' } },
  ]), { kept: 2, skipped: 1, withText: 1, withVoice: 1, withReaction: 1 });
});

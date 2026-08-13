import assert from 'node:assert/strict';
import test from 'node:test';

import { executeTonightCommit } from '../../src/tonightCommitModel.js';

const scope = { sessionId: 'session-1', familyId: 'family-a', userId: 'parent-a', position: 0 };

test('text-only, voice-only, reaction-only and mixed enrichment use the same canonical moment', async () => {
  const cases = [
    { draftText: 'One line', expected: ['text'] },
    { draftVoice: voice(), expected: ['voice'] },
    { favorite: true, expected: ['heart'] },
    { draftText: 'One line', draftVoice: voice(), favorite: true, reactionCode: 'spark', expected: ['text', 'voice', 'heart', 'spark'] },
  ];
  for (const input of cases) {
    const harness = commitHarness(item(input));
    const result = await executeTonightCommit({ ...scope, item: harness.item, match: {}, dependencies: harness.dependencies });
    assert.equal(result.canonicalMomentId, 'moment-1');
    assert.equal(harness.calls.media, 1);
    assert.deepEqual(harness.calls.enrichment, input.expected);
  }
});

test('media success plus voice failure retries the same stable identities without another moment', async () => {
  const harness = commitHarness(item({ draftText: 'Safe text', draftVoice: voice() }), { failVoiceOnce: true });
  await assert.rejects(
    executeTonightCommit({ ...scope, item: harness.item, match: {}, dependencies: harness.dependencies }),
    (error) => error.tonightCommitStep === 'voice',
  );
  assert.equal(harness.item.commitSteps.media, 'saved');
  assert.equal(harness.item.commitSteps.text, 'saved');
  assert.equal(harness.item.commitSteps.voice, 'failed');

  await executeTonightCommit({ ...scope, item: harness.item, match: {}, dependencies: harness.dependencies });
  assert.equal(harness.calls.media, 1, 'canonical media/moment is not recreated');
  assert.equal(harness.calls.text, 1, 'writer text is not rewritten after success');
  assert.deepEqual(harness.calls.voiceIdentities, [
    'voice-note-1|voice-object-1',
    'voice-note-1|voice-object-1',
  ]);
});

test('Tonight words attach to the exact canonical moment created by Keep', async () => {
  const harness = commitHarness(item({ draftText: 'Those bright eyes' }));

  await executeTonightCommit({ ...scope, item: harness.item, match: {}, dependencies: harness.dependencies });

  assert.deepEqual(harness.calls.textInputs, [{
    familyId: 'family-a',
    momentId: 'moment-1',
    note: 'Those bright eyes',
  }]);
});

test('reaction failure after moment success is idempotent across repeated Keep', async () => {
  const harness = commitHarness(item({ favorite: true, reactionCode: 'spark' }), { failSparkOnce: true });
  await assert.rejects(executeTonightCommit({ ...scope, item: harness.item, match: {}, dependencies: harness.dependencies }));
  await executeTonightCommit({ ...scope, item: harness.item, match: {}, dependencies: harness.dependencies });
  await executeTonightCommit({ ...scope, item: harness.item, match: {}, dependencies: harness.dependencies });
  assert.equal(harness.calls.media, 1);
  assert.deepEqual([...harness.calls.savedReactions].sort(), ['heart', 'spark']);
  assert.equal(harness.item.commitSteps.reaction, 'saved');
});

test('collection choices commit once after canonical media and remain retry-safe', async () => {
  const harness = commitHarness(item({
    availableCollectionKeys: ['media:photos', 'month:2026-07'],
    collectionKeys: ['media:photos'],
  }));
  await executeTonightCommit({ ...scope, item: harness.item, match: {}, dependencies: harness.dependencies });
  await executeTonightCommit({ ...scope, item: harness.item, match: {}, dependencies: harness.dependencies });
  assert.deepEqual(harness.calls.collections, [{
    familyId: 'family-a',
    momentId: 'moment-1',
    availableKeys: ['media:photos', 'month:2026-07'],
    selectedKeys: ['media:photos'],
  }]);
});

test('Tonight identifies its active item so canonical success does not finish enrichment early', async () => {
  const harness = commitHarness(item());
  await executeTonightCommit({ ...scope, item: harness.item, match: {}, dependencies: harness.dependencies });
  assert.deepEqual(harness.calls.mediaInputs[0].activeTonightItem, scope);
});

function item(overrides = {}) {
  return {
    assetId: 'asset-1',
    mediaType: 'image',
    draftText: '',
    draftVoice: null,
    favorite: false,
    reactionCode: null,
    retryId: 'retry-1',
    canonicalVoiceNoteId: 'voice-note-1',
    canonicalVoiceObjectId: 'voice-object-1',
    canonicalMomentId: null,
    commitSteps: { media: 'idle', text: 'idle', voice: 'idle', reaction: 'idle', collection: 'idle' },
    ...overrides,
  };
}

function voice() {
  return { uri: 'file:///private/tonight.m4a', durationSec: 8, mimeType: 'audio/mp4', waveform: [0.2, 0.7] };
}

function commitHarness(initialItem, options = {}) {
  const calls = {
    media: 0,
    mediaInputs: [],
    text: 0,
    textInputs: [],
    enrichment: [],
    voiceIdentities: [],
    savedReactions: new Set(),
    collections: [],
  };
  let failedVoice = false;
  let failedSpark = false;
  const dependencies = {
    beginTonightKeep: () => ({ alreadyComplete: false, item: initialItem }),
    markTonightCommitStep: ({ step, state, canonicalMomentId }) => {
      initialItem.commitSteps[step] = state;
      if (canonicalMomentId) initialItem.canonicalMomentId = canonicalMomentId;
      return initialItem;
    },
    setBaby: async (input) => {
      calls.media += 1;
      calls.mediaInputs.push(input);
    },
    savedTarget: async () => ({ moment_id: 'moment-1' }),
    saveText: async (input) => {
      calls.text += 1;
      calls.textInputs.push(input);
      calls.enrichment.push('text');
    },
    saveVoice: async ({ voiceNoteId, voiceObjectId }) => {
      calls.voiceIdentities.push(`${voiceNoteId}|${voiceObjectId}`);
      if (options.failVoiceOnce && !failedVoice) {
        failedVoice = true;
        throw new Error('voice unavailable');
      }
      calls.enrichment.push('voice');
    },
    saveReaction: async ({ emoji }) => {
      if (options.failSparkOnce && emoji === 'spark' && !failedSpark) {
        failedSpark = true;
        throw new Error('reaction unavailable');
      }
      calls.savedReactions.add(emoji);
      calls.enrichment.push(emoji);
    },
    saveCollections: async (input) => { calls.collections.push(input); },
  };
  return { item: initialItem, calls, dependencies };
}

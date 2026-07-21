import assert from 'node:assert/strict';
import test from 'node:test';

import {
  annotationDraftAnalytics,
  annotationDraftKey,
  clearSharedAnnotationDraft,
  readSharedAnnotationDraft,
  saveSharedAnnotationDraft,
} from '../../src/sharedAnnotationDraftModel.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: async (key) => values.get(key) || null,
    setItem: async (key, value) => values.set(key, value),
    removeItem: async (key) => values.delete(key),
  };
}

const scope = { familyId: 'family-a', userId: 'parent-a', momentId: 'moment-a' };

test('scopes drafts to family, author, and moment', () => {
  assert.notEqual(annotationDraftKey(scope), annotationDraftKey({ ...scope, userId: 'parent-b' }));
  assert.notEqual(annotationDraftKey(scope), annotationDraftKey({ ...scope, familyId: 'family-b' }));
  assert.notEqual(annotationDraftKey(scope), annotationDraftKey({ ...scope, momentId: 'moment-b' }));
});

test('survives a store reload with stable retry identities', async () => {
  const storage = memoryStorage();
  const saved = await saveSharedAnnotationDraft(scope, {
    text: 'The story behind this moment',
    voice: { uri: 'file:///private.m4a', durationSec: 8, waveform: [0.2, 0.6] },
    commitState: 'failed',
    lastErrorCode: 'save_failed',
  }, storage);
  const resumed = await readSharedAnnotationDraft(scope, storage);
  assert.equal(resumed.text, 'The story behind this moment');
  assert.equal(resumed.voice.uri, 'file:///private.m4a');
  assert.equal(resumed.voice.durationSec, 8);
  assert.equal(resumed.commitState, 'failed');
  assert.equal(resumed.textAnnotationId, saved.textAnnotationId);
  assert.equal(resumed.voiceAnnotationId, saved.voiceAnnotationId);
  assert.equal(resumed.voiceNoteId, saved.voiceNoteId);
  assert.equal(resumed.voiceObjectId, saved.voiceObjectId);
});

test('clears only the selected scoped draft and reports no content or identifiers', async () => {
  const storage = memoryStorage();
  await saveSharedAnnotationDraft(scope, { text: 'private words' }, storage);
  await saveSharedAnnotationDraft({ ...scope, userId: 'parent-b' }, { text: 'other words' }, storage);
  await clearSharedAnnotationDraft(scope, { storage, removeVoice: false });
  assert.equal((await readSharedAnnotationDraft(scope, storage)).text, '');
  assert.equal((await readSharedAnnotationDraft({ ...scope, userId: 'parent-b' }, storage)).text, 'other words');
  assert.deepEqual(annotationDraftAnalytics({ text: 'private words', voice: { uri: '/private' }, commitState: 'failed' }), {
    has_text: true,
    has_voice: true,
    commit_state: 'failed',
  });
});

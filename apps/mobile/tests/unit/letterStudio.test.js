import assert from 'node:assert/strict';
import test from 'node:test';

import { attachmentTarget } from '../../src/mediaAttachmentTarget.js';
import { letterDraftState, transcribeLocalLetterRecording } from '../../src/letterStudioModel.js';

test('letters save from words, media, or local voice without requiring a title', () => {
  assert.deepEqual(letterDraftState({ title: 'Title only' }), { hasDraft: true, canSave: false });
  assert.deepEqual(letterDraftState({ body: 'Parent words' }), { hasDraft: true, canSave: true });
  assert.equal(letterDraftState({ assets: [{ uri: 'file:///photo.jpg' }] }).canSave, true);
  assert.equal(letterDraftState({ voice: { uri: 'file:///voice.m4a' } }).canSave, true);
});

test('letter transcription invokes only the supplied on-device interface', async () => {
  const calls = [];
  const text = await transcribeLocalLetterRecording('file:///private/letter.m4a', async (uri) => {
    calls.push(uri);
    return '  Parent transcript  ';
  });
  assert.equal(text, 'Parent transcript');
  assert.deepEqual(calls, ['file:///private/letter.m4a']);
  await assert.rejects(
    transcribeLocalLetterRecording('https://example.com/voice.m4a', async () => 'never'),
    /local recording/,
  );
});

test('letter attachment targets are mutually exclusive with moment targets', () => {
  assert.deepEqual(attachmentTarget({ familyId: 'family-a', letterId: 'letter-a' }), {
    id: 'letter-a',
    basePath: 'family-a/letters/letter-a',
    columns: { letter_id: 'letter-a' },
  });
  assert.throws(() => attachmentTarget({ familyId: 'family-a', momentId: 'moment-a', letterId: 'letter-a' }), /exactly one/i);
});

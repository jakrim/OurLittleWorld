import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const MOBILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPO_ROOT = path.resolve(MOBILE_ROOT, '../..');

test('letter studio exposes durable media, voice, and editable transcription tools', async () => {
  const source = await readFile(path.join(MOBILE_ROOT, 'src/LetterComposeSheetScreen.js'), 'utf8');

  assert.match(source, /launchImageLibraryAsync/);
  assert.match(source, /launchCameraAsync/);
  assert.match(source, /useAudioRecorder/);
  assert.match(source, /transcribeLetterRecording/);
  assert.match(source, /setBody\(\(current\).*transcript/s);
  assert.match(source, /uploadLetterAttachments/);
  assert.match(source, /canSave = Boolean\(body\.trim\(\) \|\| assets\.length \|\| voice\?\.uri\)/);
});

test('letter attachments have exactly one owner and remain writer-only', async () => {
  const migration = await readFile(
    path.join(REPO_ROOT, 'supabase/migrations/20260711230000_letter_media_attachments.sql'),
    'utf8',
  );

  assert.match(migration, /add column if not exists letter_id uuid references public\.letters\(id\) on delete cascade/);
  assert.match(migration, /num_nonnulls\(moment_id, letter_id\) = 1/g);
  assert.match(migration, /moment_id is not null\s+and public\.is_family_circle_member/s);
  assert.doesNotMatch(migration, /letter_id is not null\s+and public\.is_family_circle_member/s);
});

test('letter transcription explicitly requires on-device recognition', async () => {
  const source = await readFile(
    path.join(MOBILE_ROOT, 'modules/expo-letter-transcriber/ios/ExpoLetterTranscriberModule.swift'),
    'utf8',
  );

  assert.match(source, /supportsOnDeviceRecognition/);
  assert.match(source, /requiresOnDeviceRecognition = true/);
  assert.doesNotMatch(source, /URLSession|uploadTask|dataTask/);
});

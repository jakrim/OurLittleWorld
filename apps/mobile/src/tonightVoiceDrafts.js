import * as FileSystem from 'expo-file-system/legacy';

const TONIGHT_VOICE_DRAFT_DIRECTORY = `${FileSystem.documentDirectory}tonight-voice-drafts-v1/`;

export async function persistTonightVoiceDraft({ sourceUri, sessionId, position }) {
  if (!sourceUri || !sessionId) throw new Error('Recording did not produce a durable file');
  await FileSystem.makeDirectoryAsync(TONIGHT_VOICE_DRAFT_DIRECTORY, { intermediates: true });
  if (sourceUri.startsWith(TONIGHT_VOICE_DRAFT_DIRECTORY)) return sourceUri;
  const token = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const safeSession = String(sessionId).replace(/[^a-zA-Z0-9-]/g, '').slice(-48);
  const destination = `${TONIGHT_VOICE_DRAFT_DIRECTORY}${safeSession}-${Number(position || 0)}-${token}.m4a`;
  await FileSystem.copyAsync({ from: sourceUri, to: destination });
  return destination;
}

export async function deleteTonightVoiceDraft(uri) {
  if (!isTonightVoiceDraft(uri)) return false;
  await FileSystem.deleteAsync(uri, { idempotent: true });
  return true;
}

export async function cleanupOrphanedTonightVoiceDrafts(activeUris = []) {
  const activeNames = new Set(activeUris.filter(isTonightVoiceDraft).map(fileName));
  const info = await FileSystem.getInfoAsync(TONIGHT_VOICE_DRAFT_DIRECTORY);
  if (!info.exists) return { inspected: 0, deleted: 0 };
  const names = await FileSystem.readDirectoryAsync(TONIGHT_VOICE_DRAFT_DIRECTORY);
  let deleted = 0;
  for (const name of names.slice(0, 200)) {
    if (activeNames.has(name)) continue;
    await FileSystem.deleteAsync(`${TONIGHT_VOICE_DRAFT_DIRECTORY}${name}`, { idempotent: true });
    deleted += 1;
  }
  return { inspected: Math.min(names.length, 200), deleted };
}

export function isTonightVoiceDraft(uri) {
  return typeof uri === 'string' && uri.startsWith(TONIGHT_VOICE_DRAFT_DIRECTORY);
}

function fileName(uri) {
  return String(uri).split('/').pop() || '';
}

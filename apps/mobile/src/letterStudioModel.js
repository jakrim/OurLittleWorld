const LOCAL_RECORDING_PREFIXES = ['file://', 'content://'];

export function letterDraftState({ title = '', body = '', assets = [], voice = null } = {}) {
  return {
    hasDraft: Boolean(String(title).trim() || String(body).trim() || assets.length || voice?.uri),
    canSave: Boolean(String(body).trim() || assets.length || voice?.uri),
  };
}

export async function transcribeLocalLetterRecording(uri, transcribe) {
  const localUri = String(uri || '').trim();
  if (!LOCAL_RECORDING_PREFIXES.some((prefix) => localUri.startsWith(prefix))) {
    throw new Error('Letter transcription requires a local recording');
  }
  if (typeof transcribe !== 'function') {
    throw new Error('On-device transcription requires the latest iPhone app build');
  }
  return String(await transcribe(localUri) || '').trim();
}

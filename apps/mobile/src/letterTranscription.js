import { Platform } from 'react-native';

let nativeTranscriber = null;
if (Platform.OS === 'ios') {
  try {
    nativeTranscriber = require('../modules/expo-letter-transcriber').default;
  } catch {
    nativeTranscriber = null;
  }
}

export function canTranscribeLetterLocally() {
  return Boolean(nativeTranscriber?.transcribe);
}

export async function transcribeLetterRecording(uri) {
  if (!uri) throw new Error('No voice recording to transcribe');
  if (!canTranscribeLetterLocally()) {
    throw new Error('On-device transcription requires the latest iPhone app build');
  }
  const text = await nativeTranscriber.transcribe(uri);
  return String(text || '').trim();
}

import { Platform } from 'react-native';
import { transcribeLocalLetterRecording } from './letterStudioModel.js';

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
  return transcribeLocalLetterRecording(uri, nativeTranscriber?.transcribe?.bind(nativeTranscriber));
}

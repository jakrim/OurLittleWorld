import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import {
  annotationDraftAnalytics,
  annotationDraftKey,
  clearSharedAnnotationDraft as clearDraft,
  readSharedAnnotationDraft as readDraft,
  saveSharedAnnotationDraft as saveDraft,
} from './sharedAnnotationDraftModel';

const DIRECTORY = `${FileSystem.documentDirectory}shared-annotation-drafts-v1/`;

export { annotationDraftAnalytics, annotationDraftKey };

export async function readSharedAnnotationDraft(scope, storage = AsyncStorage) {
  return readDraft(scope, storage);
}

export async function saveSharedAnnotationDraft(scope, patch, storage = AsyncStorage) {
  return saveDraft(scope, patch, storage);
}

export async function clearSharedAnnotationDraft(scope, { storage = AsyncStorage, removeVoice = true } = {}) {
  return clearDraft(scope, { storage, removeVoice, deleteVoice: deleteSharedAnnotationVoiceDraft });
}

export async function persistSharedAnnotationVoiceDraft({ sourceUri, momentId }) {
  if (!sourceUri || !momentId) throw new Error('Recording did not produce a durable file');
  await FileSystem.makeDirectoryAsync(DIRECTORY, { intermediates: true });
  if (isSharedAnnotationVoiceDraft(sourceUri)) return sourceUri;
  const destination = `${DIRECTORY}${safeToken(momentId)}-${draftUuid()}.m4a`;
  await FileSystem.copyAsync({ from: sourceUri, to: destination });
  return destination;
}

export async function deleteSharedAnnotationVoiceDraft(uri) {
  if (!isSharedAnnotationVoiceDraft(uri)) return false;
  await FileSystem.deleteAsync(uri, { idempotent: true });
  return true;
}

export function isSharedAnnotationVoiceDraft(uri) {
  return typeof uri === 'string' && uri.startsWith(DIRECTORY);
}

function safeToken(value) {
  return String(value).replace(/[^a-zA-Z0-9-]/g, '').slice(-48);
}

function draftUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

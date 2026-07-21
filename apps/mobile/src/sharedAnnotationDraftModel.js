const VERSION = 1;

export function annotationDraftKey({ familyId, userId, momentId }) {
  if (!familyId || !userId || !momentId) throw new Error('Annotation draft scope is required');
  return `olw:shared-annotation-draft:v${VERSION}:${familyId}:${userId}:${momentId}`;
}

export async function readSharedAnnotationDraft(scope, storage) {
  const raw = await storage.getItem(annotationDraftKey(scope));
  if (!raw) return createDraft();
  try {
    return normalizeDraft(JSON.parse(raw));
  } catch {
    return createDraft();
  }
}

export async function saveSharedAnnotationDraft(scope, patch, storage) {
  const current = await readSharedAnnotationDraft(scope, storage);
  const next = normalizeDraft({ ...current, ...patch, updatedAt: new Date().toISOString() });
  await storage.setItem(annotationDraftKey(scope), JSON.stringify(next));
  return next;
}

export async function clearSharedAnnotationDraft(scope, { storage, removeVoice = true, deleteVoice } = {}) {
  const current = await readSharedAnnotationDraft(scope, storage);
  if (removeVoice && current.voice?.uri && deleteVoice) await deleteVoice(current.voice.uri);
  await storage.removeItem(annotationDraftKey(scope));
  return current;
}

export function annotationDraftAnalytics(draft) {
  return {
    has_text: Boolean(String(draft?.text || '').trim()),
    has_voice: Boolean(draft?.voice?.uri),
    commit_state: ['draft', 'saving', 'failed', 'done'].includes(draft?.commitState)
      ? draft.commitState
      : 'draft',
  };
}

function createDraft() {
  return normalizeDraft({});
}

function normalizeDraft(value) {
  const voice = value?.voice?.uri ? {
    uri: String(value.voice.uri),
    durationSec: finiteOrNull(value.voice.durationSec),
    mimeType: String(value.voice.mimeType || 'audio/mp4'),
    waveform: Array.isArray(value.voice.waveform) ? value.voice.waveform.slice(0, 64).map(Number).filter(Number.isFinite) : [],
  } : null;
  return {
    version: VERSION,
    text: String(value?.text || '').slice(0, 1000),
    voice,
    textAnnotationId: validUuid(value?.textAnnotationId) || uuid(),
    voiceAnnotationId: validUuid(value?.voiceAnnotationId) || uuid(),
    voiceNoteId: validUuid(value?.voiceNoteId) || uuid(),
    voiceObjectId: validUuid(value?.voiceObjectId) || uuid(),
    commitState: ['draft', 'saving', 'failed', 'done'].includes(value?.commitState) ? value.commitState : 'draft',
    lastErrorCode: value?.lastErrorCode ? String(value.lastErrorCode).slice(0, 80) : null,
    updatedAt: value?.updatedAt || null,
  };
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
    ? String(value)
    : null;
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const r = (n) => Array.from({ length: n }, () => ((Math.random() * 16) | 0).toString(16)).join('');
  return `${r(8)}-${r(4)}-4${r(3)}-${(8 + ((Math.random() * 4) | 0)).toString(16)}${r(3)}-${r(12)}`;
}

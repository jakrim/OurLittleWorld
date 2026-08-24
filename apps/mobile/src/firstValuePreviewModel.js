export const FIRST_VALUE_PREVIEW_SCHEMA_VERSION = 1;

const LOCAL_URI_PREFIXES = ['file://', 'ph://', 'content://', 'assets-library://'];

export function firstValuePreviewStorageKey({ familyId, userId }) {
  if (!familyId || !userId) return null;
  return `olw:first-value-preview:${familyId}:${userId}`;
}

export function previewFromMatch(match, now = new Date()) {
  const assetId = String(match?.sourceAssetId || match?.assetId || '').trim();
  const localUri = String(match?.previewUri || match?.localUri || '').trim();
  if (!assetId || !isDeviceLocalUri(localUri)) return null;

  return {
    schemaVersion: FIRST_VALUE_PREVIEW_SCHEMA_VERSION,
    status: 'found',
    assetId,
    localUri,
    mediaType: match?.mediaType === 'video' ? 'video' : 'image',
    creationTime: finiteNumberOrNull(match?.creationTime),
    frameTimeMs: finiteNumberOrNull(match?.frameTimeMs),
    foundAt: now.toISOString(),
    approvedAt: null,
    keptAt: null,
  };
}

export function previewFromReference(reference, now = new Date()) {
  if (!reference?.parentConfirmed) return null;
  return previewFromMatch({
    assetId: reference.assetId,
    localUri: reference.uri,
    mediaType: 'image',
    creationTime: reference.capturedAt,
  }, now);
}

export function approveFirstValuePreview(preview, now = new Date()) {
  if (!isFirstValuePreview(preview)) return null;
  return {
    ...preview,
    status: 'approved',
    approvedAt: preview.approvedAt || now.toISOString(),
  };
}

export function keepFirstValuePreview(preview, now = new Date()) {
  if (!isApprovedFirstValuePreview(preview)) return null;
  return {
    ...preview,
    status: 'kept',
    keptAt: preview.keptAt || now.toISOString(),
  };
}

export function isFirstValuePreview(value) {
  return Boolean(
    value
    && value.schemaVersion === FIRST_VALUE_PREVIEW_SCHEMA_VERSION
    && ['found', 'approved', 'kept'].includes(value.status)
    && typeof value.assetId === 'string'
    && value.assetId.length > 0
    && isDeviceLocalUri(value.localUri),
  );
}

export function isApprovedFirstValuePreview(value) {
  return isFirstValuePreview(value) && ['approved', 'kept'].includes(value.status);
}

export function previewAnalyticsProperties(preview) {
  return {
    preview_state: isApprovedFirstValuePreview(preview) ? 'approved' : 'found',
    media_kind: preview?.mediaType === 'video' ? 'video' : 'photo',
  };
}

export function firstValueReferenceExclusionIds(profile) {
  const ids = new Set();
  for (const reference of profile?.references || []) {
    const raw = String(reference?.assetId || '').trim();
    if (!raw) continue;
    ids.add(raw);
    ids.add(raw.startsWith('ph://') ? raw.slice('ph://'.length) : raw);
  }
  return ids;
}

export function isFirstValueReferenceEcho(match) {
  const rawScore = Number(match?.rawScore ?? match?.score ?? 0);
  return Number.isFinite(rawScore) && rawScore >= 0.9995;
}

function isDeviceLocalUri(value) {
  return LOCAL_URI_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function finiteNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

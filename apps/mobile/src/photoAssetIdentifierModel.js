export function normalizeMediaLibraryAssetId(assetId) {
  if (!assetId) return '';
  const raw = String(assetId);
  return raw.startsWith('ph://') ? raw.slice('ph://'.length) : raw;
}

const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Build the identifier expected by the SDK 57 Asset constructor without
 * guessing across platform-specific media stores.
 *
 * iOS accepts `ph://` PHAsset identifiers. Android requires a MediaStore
 * content URI; ImagePicker returns only its numeric row id, so reconstruct
 * that URI only when the picker also supplied a trustworthy media type.
 */
export function assetConstructorIdentifier(assetId, { platform, mediaType } = {}) {
  if (!assetId) return assetId;
  const raw = String(assetId);
  if (URI_SCHEME.test(raw)) return raw;

  if (platform === 'ios') return `ph://${raw}`;
  if (platform !== 'android' || !/^\d+$/.test(raw)) return raw;

  const normalizedMediaType = String(mediaType || '').toLowerCase();
  if (normalizedMediaType === 'image' || normalizedMediaType === 'photo') {
    return `content://media/external/images/media/${raw}`;
  }
  if (normalizedMediaType === 'video') {
    return `content://media/external/video/media/${raw}`;
  }
  return raw;
}

/**
 * The SDK 57 iOS Asset constructor forwards its string through the native
 * `ph://` initializer. Bare PH local identifiers therefore need the scheme;
 * otherwise native code drops their first five characters before lookup.
 */
export function uriForNativeVision(assetId) {
  if (!assetId) return assetId;
  const raw = String(assetId);
  if (
    raw.startsWith('ph://')
    || raw.startsWith('file://')
    || raw.startsWith('content://')
    || raw.startsWith('assets-library://')
  ) {
    return raw;
  }
  return `ph://${raw}`;
}

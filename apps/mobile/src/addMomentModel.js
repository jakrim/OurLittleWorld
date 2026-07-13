import { childScopeContext } from './childScopeModel.js';

export function buildAddMomentState({
  assets = [],
  voice = null,
  note = '',
  title = '',
  place = '',
  tags = [],
  childId = null,
} = {}) {
  const scope = childScopeContext(childId);
  const mediaCount = Array.isArray(assets)
    ? assets.filter((asset) => asset?.uri).length
    : 0;
  const hasVoice = Boolean(voice?.uri);
  const hasText = Boolean(String(note || '').trim());
  const cleanTags = Array.isArray(tags)
    ? tags.map((tag) => String(tag || '').trim()).filter(Boolean)
    : [];
  const hasContext = Boolean(
    String(title || '').trim()
    || String(place || '').trim()
    || cleanTags.length,
  );
  const hasPrimaryContent = mediaCount > 0 || hasVoice || hasText;

  return {
    ...scope,
    mediaCount,
    hasMedia: mediaCount > 0,
    hasVoice,
    hasText,
    hasContext,
    hasPrimaryContent,
    canSave: hasPrimaryContent,
    canShowContext: hasPrimaryContent || hasContext,
  };
}

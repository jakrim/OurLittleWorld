import { normalizeChildId } from './childScopeModel.js';

export function buildMomentConnectionChips({
  moment = null,
  firsts = [],
  letters = [],
  digest = null,
  canWrite = false,
  childId = null,
} = {}) {
  if (!moment?.id) return [];
  const scopedChildId = normalizeChildId(childId);

  const linkedFirsts = (firsts || []).filter((first) => first?.id);
  const linkedLetters = (letters || []).filter((letter) => letter?.id);
  const voiceCount = Array.isArray(moment.voiceNotes) ? moment.voiceNotes.length : 0;
  const mediaCount = Array.isArray(moment.media) ? moment.media.length : 0;
  const hasMediaOrVoice = mediaCount > 0 || voiceCount > 0;
  const hasWrittenContext = Boolean(String(moment.title || '').trim() || String(moment.caption_note || '').trim());
  const hasDurableContext = hasWrittenContext || voiceCount > 0 || linkedFirsts.length > 0 || linkedLetters.length > 0;
  const chips = [];

  if (linkedFirsts.length) {
    const first = linkedFirsts[0];
    chips.push({
      key: 'first',
      kind: 'first',
      group: 'connection',
      label: linkedFirsts.length === 1 ? 'First' : `${linkedFirsts.length} firsts`,
      detail: first.title || 'Saved first',
      icon: 'flag-outline',
      route: {
        pathname: '/first-compose',
        params: compactParams({ id: first.id, momentId: moment.id, childId: scopedChildId }),
      },
    });
  } else if (canWrite) {
    chips.push({
      key: 'possible-first',
      kind: 'first-action',
      group: 'action',
      label: 'Mark a first',
      detail: 'Save this moment as a milestone.',
      icon: 'flag-outline',
      route: {
        pathname: '/first-compose',
        params: compactParams({
          momentId: moment.id,
          sourceMomentId: moment.id,
          seedDate: isoDateForParam(moment.captured_at || moment.capturedAt),
          childId: scopedChildId,
        }),
      },
    });
  }

  if (linkedLetters.length) {
    const letter = linkedLetters[0];
    chips.push({
      key: 'letter',
      kind: 'letter',
      group: 'connection',
      label: linkedLetters.length === 1 ? 'Letter' : `${linkedLetters.length} letters`,
      detail: letter.title || 'Saved letter',
      icon: 'mail-outline',
      route: { pathname: '/letter-detail', params: compactParams({ id: letter.id, childId: scopedChildId }) },
    });
  } else if (canWrite) {
    chips.push({
      key: 'write-letter',
      kind: 'letter-action',
      group: 'action',
      label: 'Write letter',
      detail: 'Start a letter from this moment.',
      icon: 'mail-outline',
      route: {
        pathname: '/letter-compose',
        params: compactParams({
          sourceMomentId: moment.id,
          sourceFirstId: linkedFirsts[0]?.id,
          childId: scopedChildId,
        }),
      },
    });
  }

  if (digest?.id || digest?.weekStart || digest?.week_start) {
    chips.push({
      key: 'digest',
      kind: 'digest',
      group: 'connection',
      label: 'Weekly recap',
      detail: digest.headline || 'Included in the weekly recap.',
      icon: 'newspaper-outline',
    });
  }

  if (!hasDurableContext && canWrite && hasMediaOrVoice) {
    chips.push({
      key: 'book-ready',
      kind: 'book-ready-action',
      group: 'action',
      label: 'Add a note',
      detail: 'Remember what made this moment matter.',
      icon: 'book-outline',
      action: 'edit',
    });
  }

  return chips;
}

function isoDateForParam(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function compactParams(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null && value !== undefined && value !== ''),
  );
}

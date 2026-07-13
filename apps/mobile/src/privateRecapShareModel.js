import { childScopeContext } from './childScopeModel.js';

export const PRIVATE_RECAP_ACCESS_MODEL = Object.freeze({
  publicLinksEnabled: false,
  linkScope: 'none',
  selectedContentOnly: true,
  fullAppAccessShared: false,
  futureLinkRequirements: [
    'Server-issued opaque token',
    'Selected recap or book-preview snapshot only',
    'Family writer can revoke access',
    'No writer, app, or archive-wide permissions',
  ],
});

export function buildPrivateBookPreviewSharePayload({
  family = null,
  stats = {},
  years = [],
  childId = null,
} = {}) {
  const scope = childScopeContext(childId);
  const child = childName(family);
  const lines = [
    `Private book preview for ${child}`,
    'This is a private family share, not a feed or app invite.',
    'It includes only this selected book-preview summary. No public link is created.',
    '',
    countText(stats.moments, 'saved moment'),
    `${countText(stats.photos, 'photo')}, ${countText(stats.videos, 'video')}, ${countText(stats.voiceNotes, 'voice note')}`,
  ];

  if (stats.firsts) lines.push(`${Number(stats.firsts).toLocaleString()} saved firsts`);
  lines.push('');
  lines.push('Year chapters:');
  if (!years.length) {
    lines.push('- No saved years yet.');
  } else {
    years.forEach((year) => {
      lines.push(`- ${year.year}: ${countText(year.moments, 'moment')}, ${countText(year.photos, 'photo')}, ${countText(year.videos, 'video')}, ${countText(year.voiceNotes, 'voice note')}`);
    });
  }

  return {
    ...scope,
    title: `${child}'s private book preview`,
    message: lines.join('\n'),
    access: PRIVATE_RECAP_ACCESS_MODEL,
  };
}

export function buildPrivateDigestSharePayload({
  digest = {},
  family = null,
  summary = '',
  childId = null,
} = {}) {
  const scope = childScopeContext(childId);
  const child = childName(family);
  const lines = [
    `Private weekly recap for ${child}`,
    'This is a private family share, not a feed or app invite.',
    'It includes only this selected weekly recap. No public link is created.',
    '',
    summary || digestSummaryLine(digest, child),
  ];
  if (digest?.weekStart || digest?.weekEnd) {
    lines.push(`Week: ${[digest.weekStart, digest.weekEnd].filter(Boolean).join(' to ')}`);
  }

  return {
    ...scope,
    title: `${child}'s private weekly recap`,
    message: lines.join('\n'),
    access: PRIVATE_RECAP_ACCESS_MODEL,
  };
}

function childName(family) {
  return family?.babyName || 'your little one';
}

function digestSummaryLine(digest = {}, child) {
  const moments = Number(digest.momentCount ?? digest.photoCount ?? 0);
  const firsts = Number(digest.milestoneCount ?? digest.firstsCount ?? 0);
  const voice = Number(digest.voiceNoteCount || 0);
  const letters = Number(digest.letterCount || 0);
  const parts = [];
  if (moments) parts.push(countText(moments, 'saved moment'));
  if (firsts) parts.push(countText(firsts, 'first'));
  if (voice) parts.push(countText(voice, 'voice note'));
  if (letters) parts.push(countText(letters, 'letter'));
  if (!parts.length) return `A quiet week for ${child}, still kept in one place.`;
  return `This recap includes ${joinParts(parts)}.`;
}

function countText(value, singular, plural = `${singular}s`) {
  const count = Number(value || 0);
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function joinParts(parts) {
  if (parts.length <= 1) return parts[0] || '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

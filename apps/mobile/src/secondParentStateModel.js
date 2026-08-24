export function buildPromptAnswerStatusLabel({
  promptState = null,
  membersById = {},
  userId = null,
} = {}) {
  const answered = (promptState?.responses || []).filter(isAnsweredPromptRow);
  if (!answered.length) return null;

  const mineAnswered = promptState?.mineAnswered
    ?? answered.some((row) => row?.author_user_id === userId || row?.authorUserId === userId);
  const partnerResponse = answered.find((row) => (row?.author_user_id || row?.authorUserId) !== userId);
  const knownPartnerId = Object.keys(membersById || {}).find((id) => id && id !== userId) || null;
  const partnerId = (partnerResponse?.author_user_id || partnerResponse?.authorUserId) || knownPartnerId;
  const partnerName = promptMemberName(membersById?.[partnerId], partnerResponse ? 'your co-parent' : null);
  const partnerNameAtStart = partnerName === 'your co-parent' ? 'Your co-parent' : partnerName;

  if (mineAnswered) {
    if (promptState?.partnerAnswered || partnerResponse) return `${partnerNameAtStart || 'Your co-parent'} answered too`;
    if (knownPartnerId && partnerName) return `You answered · ${partnerName} hasn't yet`;
    return 'You answered';
  }
  if (partnerResponse) return `${partnerNameAtStart || 'Your co-parent'} answered · you haven't yet`;
  return 'Someone answered';
}

export function buildDigestViewStatusLabel({
  digestUnread = false,
  openedHere = false,
  hasServerViewState = false,
  viewers = [],
  membersById = {},
  userId = null,
} = {}) {
  if (hasServerViewState) {
    const namedViewers = (viewers || [])
      .map((viewer) => viewerLabel(viewer, { membersById, userId }))
      .filter(Boolean);
    if (namedViewers.length) return `${joinNames(namedViewers)} viewed`;
  }
  if (openedHere) return 'Opened on this device. Family-wide view names are not shown yet.';
  return digestUnread ? 'Unread on this device' : 'Opened on this device';
}

export function buildMomentPartnerStatus({
  moment = null,
  membersById = {},
  userId = null,
} = {}) {
  if (!moment) return [];
  const authorId = moment.author_user_id || moment.authorUserId || null;
  const parentNote = (moment.tags || []).some((tag) => String(tag).toLowerCase() === 'parent-note');
  const rows = [];
  if (authorId) {
    rows.push(authorId === userId
      ? 'Added by you'
      : `Added by ${promptMemberName(membersById[authorId], 'your co-parent')}`);
  }

  const viewers = uniqueOtherParents(moment.views, { membersById, userId, excludeUserId: authorId });
  if (viewers.length) rows.push(`${parentNote ? 'Read' : 'Seen'} by ${joinNames(viewers)}`);

  const reactors = uniqueOtherParents(moment.reactions, { membersById, userId });
  if (reactors.length) rows.push(`${joinNames(reactors)} reacted`);
  const repliers = uniqueOtherParents(moment.replies, { membersById, userId });
  if (repliers.length) rows.push(`${joinNames(repliers)} replied`);
  return rows;
}

function isAnsweredPromptRow(row) {
  if (!row) return false;
  return !!(String(row.response_text || row.responseText || '').trim() || row.moment_id || row.momentId);
}

function promptMemberName(value, fallback) {
  const name = String(value || '').trim();
  if (!name) return fallback;
  return name.split(/\s+/)[0] || fallback;
}

function viewerLabel(viewer, { membersById = {}, userId = null } = {}) {
  const viewerId = typeof viewer === 'string' ? viewer : (viewer?.userId || viewer?.user_id);
  if (!viewerId) return null;
  if (viewerId === userId) return 'You';
  return promptMemberName(membersById?.[viewerId], 'Your co-parent');
}

function uniqueOtherParents(rows, { membersById, userId, excludeUserId = null }) {
  const ids = new Set();
  for (const row of rows || []) {
    const id = typeof row === 'string' ? row : (row?.user_id || row?.userId || row?.author_user_id || row?.authorUserId);
    if (!id || id === userId || id === excludeUserId || ids.has(id)) continue;
    ids.add(id);
  }
  return [...ids].map((id) => promptMemberName(membersById[id], 'Your co-parent'));
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

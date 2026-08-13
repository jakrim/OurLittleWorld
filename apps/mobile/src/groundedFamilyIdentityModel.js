export function groundedMemoryAuthorLabel({
  authorUserId = null,
  currentUserId = null,
  membersById = {},
} = {}) {
  const knownName = String(membersById?.[authorUserId] || '').trim();
  if (knownName) return knownName;
  if (authorUserId && authorUserId === currentUserId) return 'You';
  return authorUserId ? 'Your co-parent' : '';
}

export function groundedFirstLookCopy({ creatorDisplayName = '' } = {}) {
  return {
    eyebrow: 'Your shared family world',
    creatorName: String(creatorDisplayName || '').trim() || 'Your co-parent',
  };
}

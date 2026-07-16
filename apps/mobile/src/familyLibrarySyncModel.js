export const FAMILY_LIBRARY_PRIVACY_COPY = 'Each parent checks only the Photos library they allow on their own phone. Only saved memories enter Our World.';

export function buildFamilyLibrarySyncModel({
  members = [],
  connections = [],
  currentUserId = null,
  now = new Date(),
} = {}) {
  const connectionByUser = new Map((connections || []).map((row) => [
    row?.userId || row?.user_id,
    row,
  ]));
  const parents = (members || [])
    .filter((member) => ['creator', 'partner'].includes(member?.role))
    .map((member) => {
      const userId = member.userId || member.user_id;
      const connection = connectionByUser.get(userId) || null;
      const mine = userId === currentUserId;
      const name = firstName(member.displayName || member.display_name) || (mine ? 'You' : 'Your co-parent');
      return {
        userId,
        mine,
        name,
        status: connection?.status || 'not_started',
        title: mine ? 'Your photo library' : `${name}'s photo library`,
        detail: connectionDetail({ connection, mine, name, now }),
        canScan: mine,
      };
    });

  return {
    privacyCopy: FAMILY_LIBRARY_PRIVACY_COPY,
    parents,
    connectedCount: parents.filter((parent) => parent.status === 'ready').length,
    heading: parents.length > 1 ? 'Two parents, two private libraries.' : 'Your private photo source.',
  };
}

function connectionDetail({ connection, mine, name, now }) {
  const status = connection?.status || 'not_started';
  if (status === 'scanning') return mine ? 'Checking this phone now.' : `${name} is checking their phone now.`;
  if (status === 'needs_permission') {
    return mine ? 'Choose photo access on this phone to contribute.' : `${name} needs to choose photo access on their phone.`;
  }
  if (status === 'error') return mine ? 'This phone will try again, or you can scan now.' : `${name}'s phone will try again.`;
  if (status === 'ready') {
    const date = relativeDate(connection?.lastSuccessAt || connection?.last_success_at, now);
    return date ? `Last checked ${date}.` : 'Connected and checking for meaningful photos.';
  }
  return mine
    ? 'Not connected on this phone yet.'
    : `${name} chooses access independently on their phone.`;
}

function relativeDate(value, now) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const today = dayKey(now);
  if (dayKey(date) === today) return 'today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return 'yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function firstName(value) {
  return String(value || '').trim().split(/\s+/)[0] || '';
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

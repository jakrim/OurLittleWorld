export const NOTIFICATION_CENTER_DAYS = 30;

export const NOTIFICATION_CATEGORY_META = {
  weekly_digest: { icon: 'calendar-outline', label: 'Weekly digest' },
  daily_prompt: { icon: 'chatbubble-ellipses-outline', label: 'Daily prompt' },
  partner_activity: { icon: 'people-outline', label: 'Partner activity' },
  new_moments: { icon: 'images-outline', label: 'New moments' },
  tonight_picks: { icon: 'moon-outline', label: "Tonight's picks" },
  letter_openable: { icon: 'mail-open-outline', label: 'Letters' },
  circle_joined: { icon: 'person-add-outline', label: 'Circle' },
  billing_quota: { icon: 'card-outline', label: 'Billing' },
};

export function normalizeNotificationCenterRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .map((row) => ({
      id: String(row?.id || ''),
      category: String(row?.category || ''),
      title: String(row?.title || '').trim(),
      body: String(row?.body || '').trim(),
      route: String(row?.deep_link || row?.route || '').trim(),
      thumbnailUrl: row?.thumbnail_url || row?.thumbnailUrl || null,
      createdAt: row?.created_at || row?.createdAt || null,
      readAt: row?.read_at || row?.readAt || null,
      metadata: row?.metadata || {},
    }))
    .filter((row) => row.id && row.title && row.route);
}

export function groupNotificationRows(rows, now = new Date()) {
  const todayKey = localDayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDayKey(yesterday);
  const sections = [];
  const byKey = new Map();

  for (const row of normalizeNotificationCenterRows(rows)) {
    const created = row.createdAt ? new Date(row.createdAt) : null;
    const key = created && !Number.isNaN(created.getTime()) ? localDayKey(created) : 'unknown';
    const title = sectionTitleForKey({ key, todayKey, yesterdayKey, created });
    if (!byKey.has(key)) {
      const section = { key, title, rows: [] };
      byKey.set(key, section);
      sections.push(section);
    }
    byKey.get(key).rows.push({ ...row, relativeTime: relativeTimeLabel(created, now) });
  }

  return sections;
}

export function notificationCategoryMeta(category) {
  return NOTIFICATION_CATEGORY_META[category] || { icon: 'notifications-outline', label: 'Notification' };
}

function sectionTitleForKey({ key, todayKey, yesterdayKey, created }) {
  if (key === todayKey) return 'Today';
  if (key === yesterdayKey) return 'Yesterday';
  if (!created || Number.isNaN(created.getTime())) return 'Earlier';
  return created.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function relativeTimeLabel(date, now) {
  if (!date || Number.isNaN(date.getTime())) return '';
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function localDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const NOTIFICATION_DAILY_HARD_CAP = 2;
export const DEFAULT_QUIET_HOURS_START = '21:00';
export const DEFAULT_QUIET_HOURS_END = '08:00';

export const NOTIFICATION_CATEGORIES = [
  {
    key: 'weekly_digest',
    label: 'Weekly digest ready',
    detail: "When next week's story is ready.",
    route: '/digest',
    defaultEnabled: true,
  },
  {
    key: 'daily_prompt',
    label: 'Daily prompt',
    detail: 'A calm reminder if no one has answered or snoozed.',
    route: '/prompt',
    defaultEnabled: true,
  },
  {
    key: 'partner_activity',
    label: 'Partner activity',
    detail: 'Batched when your co-parent answers, saves a First, or seals a letter.',
    route: '/prompt',
    defaultEnabled: true,
  },
  {
    key: 'new_moments',
    label: 'New moments found',
    detail: 'After automatic discovery finds photos worth reviewing.',
    route: '/review',
    defaultEnabled: true,
  },
  {
    key: 'tonight_picks',
    label: "Tonight's picks",
    detail: 'Ready at 8:00 PM once Tonight ships.',
    route: '/digest',
    defaultEnabled: true,
  },
  {
    key: 'letter_openable',
    label: 'Letter openable',
    detail: 'When a sealed letter reaches its open date.',
    route: '/letters',
    defaultEnabled: true,
  },
  {
    key: 'circle_joined',
    label: 'Circle joined',
    detail: 'When an invite is redeemed.',
    route: '/invite',
    defaultEnabled: true,
  },
];

export const TRANSACTIONAL_NOTIFICATION_CATEGORY = {
  key: 'billing_quota',
  label: 'Billing and quota',
  detail: 'Always on for grace period and storage notices.',
  route: '/purchase',
};

const CATEGORY_KEYS = NOTIFICATION_CATEGORIES.map((category) => category.key);

export function defaultNotificationPreferences() {
  return {
    quietStart: DEFAULT_QUIET_HOURS_START,
    quietEnd: DEFAULT_QUIET_HOURS_END,
    categories: Object.fromEntries(
      NOTIFICATION_CATEGORIES.map((category) => [category.key, category.defaultEnabled !== false]),
    ),
  };
}

export function normalizeNotificationPreferences(rows) {
  const defaults = defaultNotificationPreferences();
  const list = Array.isArray(rows) ? rows : [];
  const next = {
    quietStart: defaults.quietStart,
    quietEnd: defaults.quietEnd,
    categories: { ...defaults.categories },
  };

  for (const row of list) {
    const key = row?.category;
    if (!CATEGORY_KEYS.includes(key)) continue;
    next.categories[key] = row.enabled ?? row.defaultEnabled ?? defaults.categories[key];
    next.quietStart = normalizeTime(row.quiet_start || row.quietStart || next.quietStart, DEFAULT_QUIET_HOURS_START);
    next.quietEnd = normalizeTime(row.quiet_end || row.quietEnd || next.quietEnd, DEFAULT_QUIET_HOURS_END);
  }

  return next;
}

export function mergeNotificationPreferences(base, patch) {
  const current = normalizeNotificationPreferences(preferencesToRows(base));
  return normalizeNotificationPreferences(preferencesToRows({
    quietStart: patch?.quietStart ?? current.quietStart,
    quietEnd: patch?.quietEnd ?? current.quietEnd,
    categories: {
      ...current.categories,
      ...(patch?.categories || {}),
    },
  }));
}

export function enabledNotificationCount(preferences) {
  const normalized = mergeNotificationPreferences(preferences, null);
  return NOTIFICATION_CATEGORIES.reduce(
    (count, category) => count + (normalized.categories[category.key] ? 1 : 0),
    0,
  );
}

export function formatQuietHours(preferences) {
  const normalized = mergeNotificationPreferences(preferences, null);
  return `${formatTime(normalized.quietStart)}-${formatTime(normalized.quietEnd)}`;
}

function preferencesToRows(preferences) {
  if (Array.isArray(preferences)) return preferences;
  const source = preferences || defaultNotificationPreferences();
  return NOTIFICATION_CATEGORIES.map((category) => ({
    category: category.key,
    enabled: source.categories?.[category.key],
    quiet_start: source.quietStart,
    quiet_end: source.quietEnd,
  }));
}

function normalizeTime(value, fallback) {
  const raw = String(value || fallback);
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const hour = Math.min(23, Math.max(0, Math.round(Number(match[1]))));
  const minute = Math.min(59, Math.max(0, Math.round(Number(match[2]))));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatTime(value) {
  const [hour, minute] = normalizeTime(value, DEFAULT_QUIET_HOURS_START).split(':').map(Number);
  const date = new Date(2000, 0, 1, hour, minute);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

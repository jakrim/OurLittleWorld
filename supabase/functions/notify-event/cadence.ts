export const NOTIFICATION_DAILY_HARD_CAP = 2;
export const DEFAULT_QUIET_START = '21:00';
export const DEFAULT_QUIET_END = '08:00';
export const TRANSACTIONAL_CATEGORY = 'billing_quota';
export const CATEGORY_DEFAULTS: Record<string, { route: string; enabled: boolean }> = {
  weekly_digest: { route: '/digest', enabled: true },
  daily_prompt: { route: '/prompt', enabled: true },
  partner_activity: { route: '/prompt', enabled: true },
  new_moments: { route: '/review', enabled: true },
  tonight_picks: { route: '/digest', enabled: true },
  letter_openable: { route: '/letters', enabled: true },
  circle_joined: { route: '/invite', enabled: true },
  billing_quota: { route: '/purchase', enabled: true },
};

type CadenceEvent = {
  familyId: string;
  category: string;
  eventKey: string | null;
};

type CadenceRow = Record<string, unknown>;

export function deliveryDecisionFromRows({
  event,
  recipientUserId,
  preferences,
  deliveries,
  today,
  now = new Date(),
}: {
  event: CadenceEvent;
  recipientUserId: string;
  preferences: CadenceRow[];
  deliveries: CadenceRow[];
  today: string;
  now?: Date;
}) {
  if (!categoryEnabled({ event, recipientUserId, preferences })) {
    return { send: false, batchKey: '' };
  }
  if (event.category !== TRANSACTIONAL_CATEGORY && inQuietHours({ event, recipientUserId, preferences, now })) {
    return { send: false, batchKey: '' };
  }

  const batchKey = event.category === 'partner_activity'
    ? `partner_activity:${event.familyId}:${recipientUserId}:${today}`
    : `${event.category}:${event.eventKey || crypto.randomUUID()}`;

  if (event.category === 'partner_activity' && deliveries.some((row) => row.batch_key === batchKey)) {
    return { send: false, batchKey };
  }
  const cappedCount = deliveries.filter((row) => row.category !== TRANSACTIONAL_CATEGORY).length;
  if (event.category !== TRANSACTIONAL_CATEGORY && cappedCount >= NOTIFICATION_DAILY_HARD_CAP) {
    return { send: false, batchKey };
  }
  return { send: true, batchKey };
}

function categoryEnabled({
  event,
  recipientUserId,
  preferences,
}: {
  event: CadenceEvent;
  recipientUserId: string;
  preferences: CadenceRow[];
}) {
  if (event.category === TRANSACTIONAL_CATEGORY) return true;
  const row = preferences.find((pref) => pref.user_id === recipientUserId && pref.category === event.category);
  return row?.enabled ?? CATEGORY_DEFAULTS[event.category]?.enabled ?? true;
}

function inQuietHours({
  event,
  recipientUserId,
  preferences,
  now,
}: {
  event: CadenceEvent;
  recipientUserId: string;
  preferences: CadenceRow[];
  now: Date;
}) {
  const row = preferences.find((pref) => pref.user_id === recipientUserId && pref.category === event.category);
  const start = minutesFor(row?.quiet_start || DEFAULT_QUIET_START);
  const end = minutesFor(row?.quiet_end || DEFAULT_QUIET_END);
  const current = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (start === end) return false;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function minutesFor(value: unknown) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Math.min(23, Math.max(0, Number(match[1]))) * 60
    + Math.min(59, Math.max(0, Number(match[2])));
}

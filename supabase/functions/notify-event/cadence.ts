export const NOTIFICATION_DAILY_HARD_CAP = 2;
export const DEFAULT_QUIET_START = '21:00';
export const DEFAULT_QUIET_END = '08:00';
export const TRANSACTIONAL_CATEGORY = 'billing_quota';
export const CATEGORY_DEFAULTS: Record<string, { route: string; enabled: boolean }> = {
  weekly_digest: { route: '/digest', enabled: true },
  daily_prompt: { route: '/prompt', enabled: true },
  partner_activity: { route: '/prompt', enabled: true },
  new_moments: { route: '/review', enabled: true },
  suggested_firsts: { route: '/firsts', enabled: true },
  // Tonight queues contain private, device-local discovery state. The server
  // must never manufacture this event without proof that a real queue exists.
  tonight_picks: { route: '/tonight', enabled: false },
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
  timeZone = null,
}: {
  event: CadenceEvent;
  recipientUserId: string;
  preferences: CadenceRow[];
  deliveries: CadenceRow[];
  today: string;
  now?: Date;
  timeZone?: string | null;
}) {
  if (!categoryEnabled({ event, recipientUserId, preferences })) {
    return { send: false, batchKey: '' };
  }
  if (event.category !== TRANSACTIONAL_CATEGORY && inQuietHours({ event, recipientUserId, preferences, now, timeZone })) {
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
  if (event.category === 'tonight_picks') return false;
  const row = preferences.find((pref) => pref.user_id === recipientUserId && pref.category === event.category);
  return row?.enabled ?? CATEGORY_DEFAULTS[event.category]?.enabled ?? true;
}

function inQuietHours({
  event,
  recipientUserId,
  preferences,
  now,
  timeZone,
}: {
  event: CadenceEvent;
  recipientUserId: string;
  preferences: CadenceRow[];
  now: Date;
  timeZone?: string | null;
}) {
  const row = preferences.find((pref) => pref.user_id === recipientUserId && pref.category === event.category);
  const start = minutesFor(row?.quiet_start || DEFAULT_QUIET_START);
  const end = minutesFor(row?.quiet_end || DEFAULT_QUIET_END);
  const current = localMinutesOfDay(now, timeZone);
  if (start === end) return false;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

// Quiet hours are family-local. Falls back to UTC when the family has no
// usable IANA timezone stored (family_ritual_settings.timezone = 'local').
export function localMinutesOfDay(now: Date, timeZone?: string | null) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      }).formatToParts(now);
      const hour = Number(parts.find((part) => part.type === 'hour')?.value);
      const minute = Number(parts.find((part) => part.type === 'minute')?.value);
      if (Number.isFinite(hour) && Number.isFinite(minute)) return (hour % 24) * 60 + minute;
    } catch {
      // invalid zone — fall through to UTC
    }
  }
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

// Family-local calendar day for the daily cap and partner batching.
export function localDayKey(now: Date, timeZone?: string | null) {
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
    } catch {
      // invalid zone — fall through to UTC
    }
  }
  return now.toISOString().slice(0, 10);
}

function minutesFor(value: unknown) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Math.min(23, Math.max(0, Number(match[1]))) * 60
    + Math.min(59, Math.max(0, Number(match[2])));
}

import { NOTIFICATION_DAILY_HARD_CAP } from './notificationSettingsModel.js';
import { isWithinQuietHours } from './suggestedFirstNotifierModel.js';

export const TONIGHT_NOTIFICATION_CATEGORY = 'tonight_picks';
export const TONIGHT_NOTIFICATION_ROUTE = '/tonight?source=notification';
export const TONIGHT_NOTIFICATION_LOCAL_TIME = '20:00';

export function tonightNotificationCopy(session) {
  const count = remainingCount(session);
  if (!count) return null;
  return {
    title: "Tonight's memories",
    body: count === 1
      ? 'One memory is ready for a quiet look tonight.'
      : `${count} memories are ready for a quiet look tonight.`,
  };
}

export function shouldScheduleTonightNotification({
  session,
  preferences,
  state,
  role,
  entitlementActive,
  now = new Date(),
  timezone = session?.timezone,
  notificationsScheduledToday = 0,
}) {
  if (!['creator', 'partner'].includes(role) || entitlementActive !== true) return false;
  if (!session?.sessionId || session.status !== 'active' || session.completed) return false;
  if (!remainingCount(session)) return false;
  if (preferences?.categories?.[TONIGHT_NOTIFICATION_CATEGORY] === false) return false;
  if (!isValidTimeZone(timezone)) return false;
  if (Number(notificationsScheduledToday || 0) >= NOTIFICATION_DAILY_HARD_CAP) return false;
  const key = tonightNotificationKey(session);
  if (normalizeTonightNotificationState(state).scheduledQueues[key]) return false;
  return Boolean(nextTonightNotificationDate({ now, timezone, preferences }));
}

export function nextTonightNotificationDate({
  now = new Date(),
  timezone,
  preferences,
  targetTime = TONIGHT_NOTIFICATION_LOCAL_TIME,
}) {
  if (!isValidTimeZone(timezone)) return null;
  const parts = zonedParts(now, timezone);
  const targetMinutes = parseMinutes(targetTime);
  const nowMinutes = parts.hour * 60 + parts.minute;
  const quietStart = preferences?.quietStart || '21:00';
  const quietEnd = preferences?.quietEnd || '08:00';

  if (nowMinutes >= targetMinutes && !isWithinQuietHoursAtZone(now, timezone, quietStart, quietEnd)) {
    return new Date(now.getTime() + 5_000);
  }

  for (let dayOffset = 0; dayOffset <= 2; dayOffset += 1) {
    const desiredDay = addLocalDays(parts, dayOffset);
    const candidate = findZonedDateTime({
      timezone,
      year: desiredDay.year,
      month: desiredDay.month,
      day: desiredDay.day,
      hour: Math.floor(targetMinutes / 60),
      minute: targetMinutes % 60,
      after: now,
    });
    if (!candidate) continue;
    if (isWithinQuietHoursAtZone(candidate, timezone, quietStart, quietEnd)) continue;
    return candidate;
  }
  return null;
}

export function isWithinQuietHoursAtZone(date, timezone, quietStart, quietEnd) {
  const parts = zonedParts(date, timezone);
  const localDate = new Date(2026, 0, 1, parts.hour, parts.minute);
  return isWithinQuietHours(localDate, quietStart, quietEnd);
}

export function findZonedDateTime({ timezone, year, month, day, hour, minute, after = new Date(0) }) {
  if (!isValidTimeZone(timezone)) return null;
  const roughUtc = Date.UTC(year, month - 1, day, hour, minute);
  const start = roughUtc - 18 * 60 * 60 * 1000;
  const end = roughUtc + 18 * 60 * 60 * 1000;
  for (let time = start; time <= end; time += 60_000) {
    const candidate = new Date(time);
    if (candidate <= after) continue;
    const parts = zonedParts(candidate, timezone);
    if (parts.year === year && parts.month === month && parts.day === day
      && parts.hour === hour && parts.minute === minute) return candidate;
  }
  return null;
}

export function tonightNotificationKey(session) {
  return `${session?.sessionId || 'missing'}:${session?.localDay || 'unknown'}`;
}

export function normalizeTonightNotificationState(input = null) {
  const raw = input && typeof input === 'object' ? input : {};
  return {
    scheduledQueues: raw.scheduledQueues && typeof raw.scheduledQueues === 'object'
      ? { ...raw.scheduledQueues }
      : {},
  };
}

export function markTonightNotificationScheduled(state, session, { identifier, scheduledAt }) {
  const next = normalizeTonightNotificationState(state);
  next.scheduledQueues[tonightNotificationKey(session)] = {
    identifier: identifier || null,
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    localDay: session.localDay,
    count: remainingCount(session),
  };
  return next;
}

export function remainingCount(session) {
  return (session?.items || []).filter((item) => ['queued', 'shown', 'unavailable'].includes(item.state)).length;
}

export function scheduledRequestCountForLocalDay(requests = [], { localDay, timezone } = {}) {
  if (!localDay || !isValidTimeZone(timezone)) return 0;
  return (requests || []).filter((request) => {
    const rawDate = request?.trigger?.date ?? request?.trigger?.timestamp ?? request?.trigger?.value;
    if (rawDate == null) return false;
    const normalized = typeof rawDate === 'number' && rawDate < 1_000_000_000_000
      ? rawDate * 1000
      : rawDate;
    const date = new Date(normalized);
    if (!Number.isFinite(date.getTime())) return false;
    const parts = zonedParts(date, timezone);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` === localDay;
  }).length;
}

function zonedParts(date, timezone) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  );
  return values;
}

function addLocalDays(parts, offset) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offset));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function parseMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return 20 * 60;
  return Math.min(23, Number(match[1])) * 60 + Math.min(59, Number(match[2]));
}

function isValidTimeZone(timezone) {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

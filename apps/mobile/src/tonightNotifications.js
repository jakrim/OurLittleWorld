import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  markTonightNotificationScheduled,
  nextTonightNotificationDate,
  normalizeTonightNotificationState,
  scheduledRequestCountForLocalDay,
  shouldScheduleTonightNotification,
  TONIGHT_NOTIFICATION_CATEGORY,
  TONIGHT_NOTIFICATION_ROUTE,
  tonightNotificationCopy,
} from './tonightNotificationModel.js';

export async function maybeScheduleTonightNotification({
  familyId,
  userId,
  session,
  preferences,
  role,
  entitlementActive,
  timezone,
  targetTime,
  now = new Date(),
}) {
  if (!familyId || !userId) return { scheduled: false, reason: 'missing-scope' };
  const state = await readState({ familyId, userId });
  if (!shouldScheduleTonightNotification({
    session,
    preferences,
    state,
    role,
    entitlementActive,
    now,
    timezone,
  })) return { scheduled: false, reason: 'not-ready' };

  const copy = tonightNotificationCopy(session);
  const triggerDate = nextTonightNotificationDate({ now, timezone, preferences, targetTime });
  if (!copy || !triggerDate) return { scheduled: false, reason: 'no-safe-time' };

  try {
    const notifications = require('expo-notifications');
    const permission = await notifications.getPermissionsAsync().catch(() => null);
    if (!hasPermission(permission)) return { scheduled: false, reason: 'permission-not-granted' };
    const existingRequests = await notifications.getAllScheduledNotificationsAsync?.().catch(() => []);
    const notificationsScheduledToday = scheduledRequestCountForLocalDay(existingRequests, {
      localDay: session.localDay,
      timezone,
    });
    if (!shouldScheduleTonightNotification({
      session,
      preferences,
      state,
      role,
      entitlementActive,
      now,
      timezone,
      notificationsScheduledToday,
    })) return { scheduled: false, reason: 'daily-cap' };
    const existing = (existingRequests || []).find((request) => (
      request?.content?.data?.category === TONIGHT_NOTIFICATION_CATEGORY
      && request?.content?.data?.queue_date === session.localDay
    ));
    if (existing?.identifier) {
      const next = markTonightNotificationScheduled(state, session, {
        identifier: existing.identifier,
        scheduledAt: triggerDate,
      });
      await writeState({ familyId, userId, state: next });
      return { scheduled: false, reason: 'already-scheduled', identifier: existing.identifier };
    }
    const identifier = await notifications.scheduleNotificationAsync({
      content: {
        ...copy,
        data: {
          route: TONIGHT_NOTIFICATION_ROUTE,
          category: TONIGHT_NOTIFICATION_CATEGORY,
          queue_state: 'ready',
          queue_count: session.items.filter((item) => ['queued', 'shown', 'unavailable'].includes(item.state)).length,
          queue_date: session.localDay,
        },
      },
      trigger: { type: 'date', date: triggerDate },
    });
    const next = markTonightNotificationScheduled(state, session, {
      identifier,
      scheduledAt: triggerDate,
    });
    await writeState({ familyId, userId, state: next });
    return { scheduled: true, identifier, triggerDate };
  } catch {
    return { scheduled: false, reason: 'native-schedule-failed' };
  }
}

export async function cancelTonightNotificationForSession({ familyId, userId, session }) {
  if (!familyId || !userId || !session?.sessionId) return false;
  const state = await readState({ familyId, userId });
  const key = `${session.sessionId}:${session.localDay || 'unknown'}`;
  const scheduled = state.scheduledQueues[key];
  if (!scheduled) return false;
  try {
    const notifications = require('expo-notifications');
    if (scheduled.identifier) await notifications.cancelScheduledNotificationAsync?.(scheduled.identifier);
  } catch {
    // The local state still needs clearing so a completed queue cannot reschedule.
  }
  delete state.scheduledQueues[key];
  await writeState({ familyId, userId, state });
  return true;
}

async function readState({ familyId, userId }) {
  try {
    const raw = await AsyncStorage.getItem(storageKey({ familyId, userId }));
    return normalizeTonightNotificationState(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeTonightNotificationState();
  }
}

async function writeState({ familyId, userId, state }) {
  await AsyncStorage.setItem(storageKey({ familyId, userId }), JSON.stringify(normalizeTonightNotificationState(state)));
}

function storageKey({ familyId, userId }) {
  return `olw:tonight-notifications:v1:${familyId}:${userId}`;
}

function hasPermission(permission) {
  return permission?.granted || permission?.ios?.status === 3;
}

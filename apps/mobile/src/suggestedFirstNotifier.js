// Suggested-firsts local notification (Y1) — impure store + native scheduler.
// Suggestions are device-local, so the nudge is a *local* notification on the
// device that generated them (not a family push — the partner's device has no
// suggestion state to open). Pure decision logic lives in
// suggestedFirstNotifierModel.js.

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  markSuggestedFirstNotified,
  normalizeNotifierState,
  shouldNotifySuggestedFirst,
  SUGGESTED_FIRSTS_CATEGORY,
  SUGGESTED_FIRSTS_ROUTE,
  suggestedFirstNotificationCopy,
} from './suggestedFirstNotifierModel';

export {
  SUGGESTED_FIRSTS_CATEGORY,
  SUGGESTED_FIRSTS_ROUTE,
} from './suggestedFirstNotifierModel';

// Schedule the local notification if the gate passes. Returns the updated
// notifier state (persisted) or null when nothing was scheduled.
export async function maybeNotifySuggestedFirst({
  familyId,
  userId,
  suggestion,
  preferences,
  now = new Date(),
} = {}) {
  if (!familyId || !suggestion?.id) return null;
  const state = await readNotifierState({ familyId, userId });
  if (!shouldNotifySuggestedFirst({ suggestion, preferences, state, now })) return null;

  const copy = suggestedFirstNotificationCopy(suggestion);
  if (!copy) return null;

  const scheduled = await scheduleLocalNotification(copy);
  if (!scheduled) return null;

  const next = markSuggestedFirstNotified(state, suggestion.id, now);
  await writeNotifierState({ familyId, userId, state: next });
  return next;
}

async function scheduleLocalNotification({ title, body }) {
  try {
    const notifications = require('expo-notifications');
    if (!notifications?.scheduleNotificationAsync) return false;
    const permission = await notifications.getPermissionsAsync().catch(() => null);
    if (!hasPermission(permission)) return false;
    await notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { route: SUGGESTED_FIRSTS_ROUTE, category: SUGGESTED_FIRSTS_CATEGORY },
      },
      trigger: null, // deliver now
    });
    return true;
  } catch (err) {
    if (__DEV__) console.warn('scheduleLocalNotification skipped', err?.message);
    return false;
  }
}

function hasPermission(permission) {
  return permission?.granted || permission?.ios?.status === 3; // AUTHORIZED
}

async function readNotifierState({ familyId, userId }) {
  try {
    const raw = await AsyncStorage.getItem(notifierStorageKey({ familyId, userId }));
    return normalizeNotifierState(raw ? JSON.parse(raw) : null);
  } catch (err) {
    console.warn('readNotifierState', err?.message);
    return normalizeNotifierState();
  }
}

async function writeNotifierState({ familyId, userId, state }) {
  try {
    await AsyncStorage.setItem(
      notifierStorageKey({ familyId, userId }),
      JSON.stringify(normalizeNotifierState(state)),
    );
  } catch (err) {
    console.warn('writeNotifierState', err?.message);
  }
}

function notifierStorageKey({ familyId, userId }) {
  return `olw:suggested-first-notify:v1:${familyId}:${userId || 'anonymous'}`;
}

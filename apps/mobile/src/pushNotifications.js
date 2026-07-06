import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState, Platform } from 'react-native';
import Constants from 'expo-constants';

import { normalizeNotificationRoute, notificationPromptStorageKey } from './notificationModel';
import { supabase } from './supabase';

export const PUSH_PERMISSION_PROMPT_TITLE = "Want to know when next week's story is ready?";
const PUSH_PERMISSION_PROMPT_BODY = 'We can send a quiet note when a digest, prompt, or family keepsake is ready.';

let nativeNotifications;
let handlerConfigured = false;

function loadNativeNotifications() {
  if (nativeNotifications !== undefined) return nativeNotifications;
  if (!hasNativeNotificationsModule()) {
    nativeNotifications = null;
    return nativeNotifications;
  }
  try {
    nativeNotifications = require('expo-notifications');
    configureNotificationHandler(nativeNotifications);
  } catch (err) {
    nativeNotifications = null;
    if (__DEV__) {
      console.warn('expo-notifications native module unavailable', err?.message);
    }
  }
  return nativeNotifications;
}

function hasNativeNotificationsModule() {
  if (Platform.OS === 'web') return false;
  try {
    const { requireOptionalNativeModule } = require('expo-modules-core');
    return Boolean(requireOptionalNativeModule?.('ExpoPushTokenManager'));
  } catch {
    return false;
  }
}

function configureNotificationHandler(notifications) {
  if (handlerConfigured || !notifications?.setNotificationHandler) return;
  handlerConfigured = true;
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function refreshPushTokenRegistration({ familyId, userId }) {
  if (!familyId || !userId) return { registered: false, reason: 'missing-family-or-user' };
  if (Platform.OS === 'web') return { registered: false, reason: 'unsupported-platform' };

  const notifications = loadNativeNotifications();
  if (!notifications) return { registered: false, reason: 'native-unavailable' };

  try {
    const permission = await notifications.getPermissionsAsync();
    if (!hasNotificationPermission(permission)) {
      return { registered: false, reason: 'permission-not-granted' };
    }
    return registerExpoPushToken({ familyId, userId, notifications });
  } catch (err) {
    console.warn('push token refresh skipped', err?.message);
    return { registered: false, reason: 'refresh-failed' };
  }
}

export async function maybePromptForPushNotifications({ familyId, userId, reason }) {
  if (!familyId || !userId) return { prompted: false, reason: 'missing-family-or-user' };
  if (Platform.OS === 'web') return { prompted: false, reason: 'unsupported-platform' };

  const notifications = loadNativeNotifications();
  if (!notifications) return { prompted: false, reason: 'native-unavailable' };

  const storageKey = notificationPromptStorageKey({ familyId, userId });
  const stored = await readPromptState(storageKey);
  if (stored?.askedAt || stored?.enabledAt) return { prompted: false, reason: 'already-asked' };

  try {
    const permission = await notifications.getPermissionsAsync();
    if (hasNotificationPermission(permission)) {
      const registration = await registerExpoPushToken({ familyId, userId, notifications });
      if (registration.registered) {
        await writePromptState(storageKey, { enabledAt: new Date().toISOString(), reason });
      }
      return { prompted: false, reason: 'already-granted' };
    }
    if (permission && permission.canAskAgain === false) {
      await writePromptState(storageKey, { askedAt: new Date().toISOString(), reason, deniedAt: new Date().toISOString() });
      return { prompted: false, reason: 'cannot-ask-again' };
    }

    const choice = await askForPushPermission();
    const askedAt = new Date().toISOString();
    if (choice !== 'enable') {
      await writePromptState(storageKey, { askedAt, reason, dismissedAt: askedAt });
      return { prompted: true, granted: false, reason: 'dismissed' };
    }

    const requested = await notifications.requestPermissionsAsync();
    if (!hasNotificationPermission(requested)) {
      await writePromptState(storageKey, { askedAt, reason, deniedAt: new Date().toISOString() });
      return { prompted: true, granted: false, reason: 'denied' };
    }

    const registration = await registerExpoPushToken({ familyId, userId, notifications });
    await writePromptState(storageKey, {
      askedAt,
      enabledAt: registration.registered ? new Date().toISOString() : null,
      reason,
    });
    return { prompted: true, granted: registration.registered, reason: registration.reason };
  } catch (err) {
    console.warn('push permission prompt skipped', err?.message);
    return { prompted: false, reason: 'prompt-failed' };
  }
}

export function addPushNotificationResponseListener(onRoute) {
  const notifications = loadNativeNotifications();
  if (!notifications) return { remove: () => {} };

  let removed = false;
  notifications.getLastNotificationResponseAsync?.()
    .then((response) => {
      if (removed) return;
      const route = routeFromNotificationResponse(response);
      if (route) onRoute(route);
    })
    .catch((err) => {
      if (__DEV__) console.warn('initial notification route skipped', err?.message);
    });

  const subscription = notifications.addNotificationResponseReceivedListener?.((response) => {
    const route = routeFromNotificationResponse(response);
    if (route) onRoute(route);
  });

  return {
    remove: () => {
      removed = true;
      subscription?.remove?.();
    },
  };
}

export async function deletePushTokensForSignOut({ userId } = {}) {
  if (!userId) return { deleted: false, reason: 'missing-user' };
  try {
    const platform = normalizePlatform();
    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('platform', platform);
    if (error) return handlePushTokenRegistryError(error, 'delete');
    return { deleted: true };
  } catch (err) {
    console.warn('push token delete skipped', err?.message);
    return { deleted: false, reason: 'delete-failed' };
  }
}

export function watchPushTokenRefresh({ familyId, userId }) {
  let active = true;

  const refresh = () => {
    if (!active || !familyId || !userId) return;
    refreshPushTokenRegistration({ familyId, userId }).catch((err) => {
      console.warn('push token foreground refresh', err?.message);
    });
  };

  refresh();
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') refresh();
  });

  return () => {
    active = false;
    subscription.remove();
  };
}

async function registerExpoPushToken({ familyId, userId, notifications }) {
  const projectId = getExpoProjectId();
  const tokenResult = await notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const expoPushToken = String(tokenResult?.data || tokenResult || '').trim();
  if (!expoPushToken) return { registered: false, reason: 'missing-token' };
  const platform = normalizePlatform();

  const row = {
    user_id: userId,
    family_id: familyId,
    expo_push_token: expoPushToken,
    platform,
    updated_at: new Date().toISOString(),
  };

  const { error: deleteError } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('family_id', familyId)
    .eq('platform', platform)
    .neq('expo_push_token', expoPushToken);
  if (deleteError) return handlePushTokenRegistryError(deleteError, 'delete-stale');

  const { error } = await supabase
    .from('push_tokens')
    .upsert(row, { onConflict: 'expo_push_token' });
  if (error) return handlePushTokenRegistryError(error, 'upsert');

  return { registered: true, reason: 'registered', token: expoPushToken };
}

function routeFromNotificationResponse(response) {
  const data = response?.notification?.request?.content?.data || {};
  return normalizeNotificationRoute(data.route || data.href || data.url);
}

function hasNotificationPermission(permission) {
  return Boolean(permission?.granted || permission?.status === 'granted');
}

function askForPushPermission() {
  return new Promise((resolve) => {
    Alert.alert(
      PUSH_PERMISSION_PROMPT_TITLE,
      PUSH_PERMISSION_PROMPT_BODY,
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve('dismiss') },
        { text: 'Turn on', onPress: () => resolve('enable') },
      ],
      { cancelable: true, onDismiss: () => resolve('dismiss') },
    );
  });
}

async function readPromptState(storageKey) {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writePromptState(storageKey, patch) {
  const current = await readPromptState(storageKey);
  await AsyncStorage.setItem(storageKey, JSON.stringify({
    ...(current || {}),
    ...patch,
  }));
}

function handlePushTokenRegistryError(error, operation) {
  const missing = error?.code === '42P01'
    || error?.code === 'PGRST205'
    || String(error?.message || '').includes('push_tokens');
  if (!missing) {
    console.warn(`push token ${operation} failed`, error?.message || error);
  }
  return { registered: false, deleted: false, reason: missing ? 'registry-unavailable' : `${operation}-failed` };
}

function getExpoProjectId() {
  return Constants?.easConfig?.projectId
    || Constants?.expoConfig?.extra?.eas?.projectId
    || Constants?.manifest2?.extra?.eas?.projectId
    || null;
}

function normalizePlatform() {
  return ['ios', 'android', 'web'].includes(Platform.OS) ? Platform.OS : 'unknown';
}

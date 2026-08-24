import AsyncStorage from '@react-native-async-storage/async-storage';

import { accountDeletionAsyncStorageKeys } from './accountDeletionModel';
import { clearAllAccountCaches } from './mediaDb';
import * as Scan from './scanController';
import { purgeSharedAnnotationVoiceDrafts } from './sharedAnnotationDraftStore';
import { purgeTonightVoiceDrafts } from './tonightVoiceDrafts';

export async function clearDeletedAccountLocalData({ familyId, userId } = {}) {
  const failures = [];

  try {
    Scan.reset();
  } catch (error) {
    failures.push(error);
  }

  try {
    clearAllAccountCaches();
  } catch (error) {
    failures.push(error);
  }

  try {
    const keys = await AsyncStorage.getAllKeys();
    const accountKeys = accountDeletionAsyncStorageKeys(keys, { familyId, userId });
    if (accountKeys.length) await AsyncStorage.multiRemove(accountKeys);
  } catch (error) {
    failures.push(error);
  }

  const draftResults = await Promise.allSettled([
    purgeTonightVoiceDrafts(),
    purgeSharedAnnotationVoiceDrafts(),
    cancelAccountNotifications(),
  ]);
  draftResults.forEach((result) => {
    if (result.status === 'rejected') failures.push(result.reason);
  });

  return {
    cleared: failures.length === 0,
    failureCount: failures.length,
  };
}

async function cancelAccountNotifications() {
  try {
    const Notifications = require('expo-notifications');
    await Notifications.cancelAllScheduledNotificationsAsync?.();
    await Notifications.setBadgeCountAsync?.(0);
  } catch {
    // Older development clients may not contain the optional native module.
  }
}

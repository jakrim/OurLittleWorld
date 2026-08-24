import { Family } from './families';
import { getLibraryPermissionStatus } from './photos';
import { readPendingMediaLibraryChange } from './mediaLibraryChanges';
import { readReferenceProfile } from './recognitionReferences';
import { readScanCheckpoint } from './scanCheckpoints';
import {
  BACKGROUND_AUTO_INGEST_MIN_INTERVAL_MINUTES,
  hasReferenceProfile,
  shouldStartBackgroundAutoIngest,
} from './foregroundAutoIngestModel';
import { startLibraryScan } from './libraryScanLauncher';
import * as Scan from './scanController';
import { supabase } from './supabase';
import { getFamilyEntitlement } from './billing';
import { readAutoIngestPowerGate } from './scanPowerPolicy';

export const BACKGROUND_AUTO_INGEST_TASK = 'olw-background-auto-ingest';

let nativeModules;
let registrationPromise = null;
let expirationSubscription = null;

function loadNativeBackgroundModules() {
  if (nativeModules !== undefined) return nativeModules;
  try {
    nativeModules = {
      BackgroundTask: require('expo-background-task'),
      TaskManager: require('expo-task-manager'),
    };
  } catch {
    nativeModules = null;
    if (__DEV__) {
      console.warn('background auto-ingest native module unavailable');
    }
  }
  return nativeModules;
}

function defineBackgroundTask(modules) {
  if (!modules?.TaskManager?.defineTask) return;
  if (modules.TaskManager.isTaskDefined?.(BACKGROUND_AUTO_INGEST_TASK)) return;

  modules.TaskManager.defineTask(BACKGROUND_AUTO_INGEST_TASK, async () => {
    try {
      await runBackgroundAutoIngest();
      return modules.BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      console.warn('background auto-ingest failed');
      return modules.BackgroundTask.BackgroundTaskResult.Failed;
    }
  });

  if (!expirationSubscription && typeof modules.BackgroundTask.addExpirationListener === 'function') {
    try {
      expirationSubscription = modules.BackgroundTask.addExpirationListener(() => {
        if (Scan.isRunning()) Scan.abort();
      });
    } catch {
      expirationSubscription = null;
    }
  }
}

defineBackgroundTask(loadNativeBackgroundModules());

export async function registerBackgroundAutoIngestTask() {
  if (registrationPromise) return registrationPromise;
  registrationPromise = (async () => {
    const modules = loadNativeBackgroundModules();
    if (!modules) return { registered: false, reason: 'native-unavailable' };
    defineBackgroundTask(modules);

    try {
      const taskManagerAvailable = typeof modules.TaskManager.isAvailableAsync === 'function'
        ? await modules.TaskManager.isAvailableAsync()
        : true;
      if (!taskManagerAvailable) return { registered: false, reason: 'task-manager-unavailable' };

      const status = await modules.BackgroundTask.getStatusAsync();
      if (status === modules.BackgroundTask.BackgroundTaskStatus.Restricted) {
        return { registered: false, reason: 'background-task-restricted' };
      }

      await modules.BackgroundTask.registerTaskAsync(BACKGROUND_AUTO_INGEST_TASK, {
        minimumInterval: BACKGROUND_AUTO_INGEST_MIN_INTERVAL_MINUTES,
      });
      const registered = await modules.TaskManager.isTaskRegisteredAsync(BACKGROUND_AUTO_INGEST_TASK);
      return { registered, reason: registered ? null : 'registration-skipped' };
    } catch {
      registrationPromise = null;
      console.warn('background auto-ingest registration failed');
      return { registered: false, reason: 'registration-error' };
    }
  })();
  return registrationPromise;
}

export async function runBackgroundAutoIngest({ nowMs = Date.now() } = {}) {
  if (Scan.isRunning()) return { started: false, reason: 'already-running' };

  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  if (!user?.id) return { started: false, reason: 'missing-session' };

  const family = await Family.current();
  if (!family?.id || !family?.babyBirthday) return { started: false, reason: 'missing-family' };
  if (!['creator', 'partner'].includes(family?.me?.role)) {
    return { started: false, reason: 'role-cannot-scan' };
  }

  // Entitlement is checked before Photos permission or any library read. A
  // lapsed family remains a read-only archive and discovery stays paused.
  const entitlement = await getFamilyEntitlement(family.id);
  if (!entitlement?.isActive) return { started: false, reason: 'inactive-entitlement' };

  const powerGate = await readAutoIngestPowerGate();
  if (powerGate.shouldPause) return { started: false, reason: powerGate.reason };

  const permission = await getLibraryPermissionStatus();
  if (!permission.granted) return { started: false, reason: 'missing-photo-permission' };

  const [profile, checkpoint, pendingChange] = await Promise.all([
    readReferenceProfile({ familyId: family.id, userId: user.id }),
    readScanCheckpoint({ familyId: family.id, userId: user.id }),
    readPendingMediaLibraryChange({ familyId: family.id, userId: user.id }),
  ]);

  if (!hasReferenceProfile(profile)) return { started: false, reason: 'missing-reference' };
  if (!shouldStartBackgroundAutoIngest({ checkpoint, pendingChange, nowMs })) {
    return { started: false, reason: 'fresh-checkpoint' };
  }

  return startLibraryScan({
    family,
    user,
    pendingLibraryChange: pendingChange,
    allowWithoutReference: false,
    waitForCompletion: true,
    entitlementActive: true,
  });
}

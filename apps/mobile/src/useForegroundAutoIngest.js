import { useCallback, useEffect, useRef } from 'react';
import { AppState, NativeModules } from 'react-native';

import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { useBilling } from './BillingContext';
import { getLibraryPermissionStatus } from './photos';
import { readPendingMediaLibraryChange } from './mediaLibraryChanges';
import { readScanCheckpoint } from './scanCheckpoints';
import { readReferenceProfile } from './recognitionReferences';
import { hasReferenceProfile, shouldStartForegroundAutoIngest } from './foregroundAutoIngestModel';
import { startLibraryScan } from './libraryScanLauncher';
import { registerBackgroundAutoIngestTask } from './backgroundAutoIngestTask';
import * as Scan from './scanController';

const AUTO_INGEST_ATTEMPT_DEBOUNCE_MS = 15000;

export default function useForegroundAutoIngest({ enabled = true } = {}) {
  const { family } = useFamily();
  const { user } = useAuth();
  const { entitlement, loading: billingLoading } = useBilling();
  const runningRef = useRef(false);
  const lastAttemptRef = useRef(0);

  const maybeStart = useCallback(async () => {
    const writer = ['creator', 'partner'].includes(family?.me?.role);
    if (!enabled || billingLoading || !entitlement?.isActive || !writer
      || !family?.id || !family?.babyBirthday || !user?.id) return;
    if (runningRef.current || Scan.isRunning()) return;
    const nowMs = Date.now();
    if (nowMs - lastAttemptRef.current < AUTO_INGEST_ATTEMPT_DEBOUNCE_MS) return;
    lastAttemptRef.current = nowMs;
    runningRef.current = true;

    try {
      const permission = await getLibraryPermissionStatus();
      if (!permission.granted) return;
      if (await isLowPowerModeEnabled()) return;

      const [profile, checkpoint, pendingChange] = await Promise.all([
        readReferenceProfile({ familyId: family.id, userId: user.id }),
        readScanCheckpoint({ familyId: family.id, userId: user.id }),
        readPendingMediaLibraryChange({ familyId: family.id, userId: user.id }),
      ]);
      if (!hasReferenceProfile(profile)) return;
      if (!shouldStartForegroundAutoIngest({ checkpoint, pendingChange, nowMs })) return;

      await startLibraryScan({
        family,
        user,
        pendingLibraryChange: pendingChange,
        allowWithoutReference: false,
        entitlementActive: true,
      });
    } catch {
      console.warn('foreground auto-ingest failed');
    } finally {
      runningRef.current = false;
    }
  }, [billingLoading, enabled, entitlement?.isActive, family, user]);

  useEffect(() => {
    if (enabled && entitlement?.isActive && ['creator', 'partner'].includes(family?.me?.role)) {
      registerBackgroundAutoIngestTask();
    }
    maybeStart();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') maybeStart();
    });
    return () => sub.remove();
  }, [enabled, entitlement?.isActive, family?.me?.role, maybeStart]);
}

async function isLowPowerModeEnabled() {
  const battery = NativeModules.ExpoBattery;
  try {
    if (typeof battery?.isLowPowerModeEnabledAsync === 'function') {
      return !!(await battery.isLowPowerModeEnabledAsync());
    }
    if (typeof battery?.getPowerStateAsync === 'function') {
      const state = await battery.getPowerStateAsync();
      return !!(state?.lowPowerMode || state?.lowPowerModeEnabled);
    }
  } catch {
    // If the optional native battery API is unavailable, don't block ingest.
  }
  return false;
}

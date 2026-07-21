let batteryModule;

function loadBatteryModule() {
  if (batteryModule !== undefined) return batteryModule;
  try {
    // Resolve the native module optionally instead of importing expo-battery's
    // strict wrapper. That keeps older development clients quiet and usable while
    // newly built clients still autolink expo-battery and expose the same method.
    const { requireOptionalNativeModule } = require('expo-modules-core');
    batteryModule = requireOptionalNativeModule('ExpoBattery');
  } catch {
    batteryModule = null;
  }
  return batteryModule;
}

export function shouldPauseAutoIngestForPowerState(powerState) {
  return powerState?.lowPowerMode === true || powerState?.lowPowerModeEnabled === true;
}

export async function readAutoIngestPowerGate({ Battery = loadBatteryModule() } = {}) {
  try {
    if (typeof Battery?.getPowerStateAsync === 'function') {
      const powerState = await Battery.getPowerStateAsync();
      if (shouldPauseAutoIngestForPowerState(powerState)) {
        return { shouldPause: true, reason: 'low-power-mode' };
      }
      return { shouldPause: false, reason: null };
    }
    if (typeof Battery?.isLowPowerModeEnabledAsync === 'function') {
      const enabled = await Battery.isLowPowerModeEnabledAsync();
      return enabled
        ? { shouldPause: true, reason: 'low-power-mode' }
        : { shouldPause: false, reason: null };
    }
  } catch {
    // Automatic discovery is opportunistic. A missing power reading should not
    // block a scan forever; the platform background scheduler remains a guard.
  }
  return { shouldPause: false, reason: 'power-state-unavailable' };
}

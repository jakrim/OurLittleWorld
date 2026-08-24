export const FOREGROUND_AUTO_SCAN_STALE_MS = 24 * 60 * 60 * 1000;
export const BACKGROUND_AUTO_INGEST_MIN_INTERVAL_MINUTES = 12 * 60;

export function hasReferenceProfile(profile) {
  return Array.isArray(profile?.references)
    && profile.references.some((reference) => reference?.embedding?.length);
}

export function shouldStartForegroundAutoIngest({
  checkpoint,
  pendingChange,
  nowMs = Date.now(),
} = {}) {
  if (pendingChange) return true;
  const lastScannedMs = checkpoint?.lastScannedAt
    ? new Date(checkpoint.lastScannedAt).getTime()
    : null;
  if (!Number.isFinite(lastScannedMs)) return true;
  return nowMs - lastScannedMs > FOREGROUND_AUTO_SCAN_STALE_MS;
}

export function shouldStartBackgroundAutoIngest(args = {}) {
  return shouldStartForegroundAutoIngest(args);
}

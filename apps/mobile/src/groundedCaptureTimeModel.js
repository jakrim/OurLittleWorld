export const UNKNOWN_CAPTURE_TIME_CODE = 'capture_time_unknown';

export const UNKNOWN_CAPTURE_TIME_MESSAGE = 'We could not confirm when this was captured. Open it in Photos, then try Keep again—or choose Another.';

export function groundedCaptureTime(...values) {
  for (const value of values) {
    const numeric = typeof value === 'number' ? value : Number.NaN;
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    if (!value || typeof value === 'number') continue;
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function groundedCaptureIso(...values) {
  const captureTime = groundedCaptureTime(...values);
  return captureTime ? new Date(captureTime).toISOString() : null;
}

export function requireGroundedCaptureIso(...values) {
  const captureTime = groundedCaptureIso(...values);
  if (captureTime) return captureTime;
  const error = new Error(UNKNOWN_CAPTURE_TIME_MESSAGE);
  error.code = UNKNOWN_CAPTURE_TIME_CODE;
  throw error;
}

export function isUnknownCaptureTimeError(error) {
  return error?.code === UNKNOWN_CAPTURE_TIME_CODE;
}

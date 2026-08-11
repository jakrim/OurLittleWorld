export function isNightlySessionContinuation(session) {
  return Number(session?.is_continuation || 0) === 1;
}

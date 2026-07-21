export function savedFingerprintTelemetry(result) {
  return { grouped_after_keep: Boolean(result) };
}

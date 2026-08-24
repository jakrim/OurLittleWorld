export const SHARED_LOOKBACK_QUERY_LIMIT = 180;
export const SHARED_EVENT_COMPANION_LIMIT = 12;

export function chooseSharedTonightLookback(rows, { localDate = new Date() } = {}) {
  const eligible = (rows || []).filter((row) => row?.id && row?.captured_at);
  if (!eligible.length) return null;
  const daySeed = Number(String(localDate instanceof Date ? localDate.toISOString() : localDate).slice(0, 10).replaceAll('-', '')) || 0;
  const sorted = eligible.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return sorted[daySeed % sorted.length];
}

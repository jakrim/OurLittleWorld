import { buildSavedDayCounts } from './firstYearCatchupModel.js';
import { replaceFamilySavedDayFacts } from './candidateLedgerStore';
import { supabase } from './supabase';

export const SAVED_DAY_COVERAGE_PAGE_SIZE = 500;
export const SAVED_DAY_COVERAGE_MAX_MOMENTS = 5000;

export async function refreshFamilySavedDayCoverage({ familyId, timezone = resolvedTimeZone() } = {}) {
  if (!familyId) return { refreshed: false, dayCount: 0, momentCount: 0 };
  const zone = timezone && timezone !== 'local' ? timezone : resolvedTimeZone();
  const dayCounts = new Map();
  let momentCount = 0;
  for (let offset = 0; offset < SAVED_DAY_COVERAGE_MAX_MOMENTS; offset += SAVED_DAY_COVERAGE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('moments')
      .select('captured_at')
      .eq('family_id', familyId)
      .order('captured_at', { ascending: false })
      .range(offset, Math.min(SAVED_DAY_COVERAGE_MAX_MOMENTS - 1, offset + SAVED_DAY_COVERAGE_PAGE_SIZE - 1));
    if (error) throw error;
    const rows = data || [];
    const pageCounts = buildSavedDayCounts(rows, zone);
    for (const [day, count] of pageCounts) dayCounts.set(day, Number(dayCounts.get(day) || 0) + count);
    momentCount += rows.length;
    if (rows.length < SAVED_DAY_COVERAGE_PAGE_SIZE) break;
  }
  replaceFamilySavedDayFacts({ familyId, dayCounts });
  return { refreshed: true, dayCount: dayCounts.size, momentCount };
}

function resolvedTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

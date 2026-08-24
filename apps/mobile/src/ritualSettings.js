import { supabase } from './supabase';
import {
  formatMonthiversary,
  monthiversaryDayForFamily,
  normalizeMonthiversaryDay,
} from './ritualSettingsModel.js';

export { formatMonthiversary, monthiversaryDayForFamily };

export const DEFAULT_RITUAL_SETTINGS = {
  dailyPromptTime: '19:30',
  weeklyDigestDay: 0,
  monthiversaryEnabled: true,
  monthiversaryDay: 1,
  timezone: 'local',
};

export const PROMPT_TIME_OPTIONS = [
  { value: '08:00', label: 'Morning' },
  { value: '12:00', label: 'Midday' },
  { value: '19:30', label: 'Evening' },
  { value: '21:00', label: 'Night' },
];

export const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export const DEFAULT_SETTINGS_COUNTS = {
  momentCount: 0,
  exportableMomentCount: 0,
  timeCapsuleCount: 0,
  sharedWithCount: 0,
  circleCount: 0,
  digestCount: 0,
};

function clampNumber(value, min, max, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, Math.round(next)));
}

function normalizeTime(value) {
  const raw = String(value || DEFAULT_RITUAL_SETTINGS.dailyPromptTime);
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return DEFAULT_RITUAL_SETTINGS.dailyPromptTime;
  const hour = clampNumber(match[1], 0, 23, 19);
  const minute = clampNumber(match[2], 0, 59, 30);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function normalizeRitualSettings(row, family) {
  return {
    dailyPromptTime: normalizeTime(row?.daily_prompt_time || row?.dailyPromptTime),
    weeklyDigestDay: clampNumber(
      row?.weekly_digest_day ?? row?.weeklyDigestDay,
      0,
      6,
      DEFAULT_RITUAL_SETTINGS.weeklyDigestDay,
    ),
    monthiversaryEnabled: row?.monthiversary_enabled ?? row?.monthiversaryEnabled ?? true,
    monthiversaryDay: normalizeMonthiversaryDay({
      row,
      family,
      fallback: DEFAULT_RITUAL_SETTINGS.monthiversaryDay,
    }),
    timezone: row?.timezone || DEFAULT_RITUAL_SETTINGS.timezone,
  };
}

function toDatabasePatch(settings) {
  return {
    daily_prompt_time: settings.dailyPromptTime,
    weekly_digest_day: settings.weeklyDigestDay,
    monthiversary_enabled: !!settings.monthiversaryEnabled,
    monthiversary_day: settings.monthiversaryDay,
    timezone: resolveTimezoneForSave(settings.timezone),
  };
}

export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// 'local' is the legacy "unknown" sentinel — replace it with the device's IANA
// zone on save so server-side quiet hours (notify-event) can run family-local.
function resolveTimezoneForSave(value) {
  const current = String(value || '').trim();
  if (current && current !== 'local') return current;
  return deviceTimeZone() || DEFAULT_RITUAL_SETTINGS.timezone;
}

// Best-effort one-time stamp for families that never open ritual settings.
export async function ensureFamilyTimezone(familyId) {
  if (!familyId) return;
  const zone = deviceTimeZone();
  if (!zone) return;
  try {
    const { data } = await supabase
      .from('family_ritual_settings')
      .select('timezone')
      .eq('family_id', familyId)
      .maybeSingle();
    if (data && data.timezone && data.timezone !== 'local') return;
    await supabase
      .from('family_ritual_settings')
      .upsert({ family_id: familyId, timezone: zone, updated_at: new Date().toISOString() }, { onConflict: 'family_id' });
  } catch (err) {
    console.warn('ensureFamilyTimezone', err?.message);
  }
}

export function formatPromptTime(value) {
  const [hour, minute] = normalizeTime(value).split(':').map(Number);
  const date = new Date(2000, 0, 1, hour, minute);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDigestDay(value) {
  return WEEKDAY_OPTIONS.find((option) => option.value === Number(value))?.label || 'Sun';
}

export async function getFamilyRitualSettings({ familyId, family }) {
  if (!familyId) return normalizeRitualSettings(null, family);
  const { data, error } = await supabase
    .from('family_ritual_settings')
    .select('daily_prompt_time, weekly_digest_day, monthiversary_enabled, monthiversary_day, timezone')
    .eq('family_id', familyId)
    .maybeSingle();
  if (error) {
    console.warn('getFamilyRitualSettings', error.message);
    return normalizeRitualSettings(null, family);
  }
  return normalizeRitualSettings(data, family);
}

export async function saveFamilyRitualSettings({ familyId, family, base, patch }) {
  if (!familyId) throw new Error('No family selected');
  const current = normalizeRitualSettings(base, family);
  const next = normalizeRitualSettings({ ...current, ...(patch || {}) }, family);
  const payload = {
    family_id: familyId,
    ...toDatabasePatch(next),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('family_ritual_settings')
    .upsert(payload, { onConflict: 'family_id' })
    .select('daily_prompt_time, weekly_digest_day, monthiversary_enabled, monthiversary_day, timezone')
    .single();
  if (error) throw error;
  return normalizeRitualSettings(data, family);
}

async function countQuery(label, query) {
  const { count, error } = await query;
  if (error) {
    console.warn(label, error.message);
    return 0;
  }
  return count || 0;
}

async function countChildLetters(familyId) {
  const query = supabase
    .from('letters')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', familyId)
    .eq('audience', 'child');
  const { count, error } = await query;
  if (!error) return count || 0;
  if (!String(error.message || '').toLowerCase().includes('audience')) {
    console.warn('countChildLetters', error.message);
    return 0;
  }
  return countQuery(
    'countChildLettersFallback',
    supabase.from('letters').select('id', { count: 'exact', head: true }).eq('family_id', familyId),
  );
}

export async function getSettingsCounts(familyId) {
  if (!familyId) return DEFAULT_SETTINGS_COUNTS;
  const [
    momentCount,
    timeCapsuleCount,
    sharedWithCount,
    circleCount,
    digestCount,
  ] = await Promise.all([
    countQuery('countMoments', supabase.from('moments').select('id', { count: 'exact', head: true }).eq('family_id', familyId)),
    countChildLetters(familyId),
    countQuery('countFamilyMembers', supabase.from('family_members').select('user_id', { count: 'exact', head: true }).eq('family_id', familyId)),
    countQuery('countCircleMembers', supabase.from('family_members').select('user_id', { count: 'exact', head: true }).eq('family_id', familyId).eq('role', 'circle')),
    countQuery('countWeeklyDigests', supabase.from('weekly_digests').select('id', { count: 'exact', head: true }).eq('family_id', familyId)),
  ]);

  return {
    momentCount,
    exportableMomentCount: momentCount,
    timeCapsuleCount,
    sharedWithCount,
    circleCount,
    digestCount,
  };
}

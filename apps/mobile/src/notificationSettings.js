import { supabase } from './supabase';
import {
  NOTIFICATION_CATEGORIES,
  defaultNotificationPreferences,
  mergeNotificationPreferences,
  normalizeNotificationPreferences,
} from './notificationSettingsModel';

export * from './notificationSettingsModel';

export async function getNotificationPreferences({ familyId, userId }) {
  if (!familyId || !userId) return defaultNotificationPreferences();
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('category, enabled, quiet_start, quiet_end')
    .eq('family_id', familyId)
    .eq('user_id', userId);
  if (error) {
    if (!isMissingNotificationTable(error)) console.warn('getNotificationPreferences', error.message);
    return defaultNotificationPreferences();
  }
  return normalizeNotificationPreferences(data);
}

export async function saveNotificationPreferences({ familyId, userId, base, patch }) {
  if (!familyId || !userId) throw new Error('No family selected');
  const next = mergeNotificationPreferences(base, patch);
  const rows = NOTIFICATION_CATEGORIES.map((category) => ({
    family_id: familyId,
    user_id: userId,
    category: category.key,
    enabled: !!next.categories[category.key],
    quiet_start: next.quietStart,
    quiet_end: next.quietEnd,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(rows, { onConflict: 'user_id,family_id,category' });
  if (error) {
    if (isMissingNotificationTable(error)) return next;
    throw error;
  }
  return next;
}

function isMissingNotificationTable(error) {
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || String(error?.message || '').includes('notification_preferences');
}

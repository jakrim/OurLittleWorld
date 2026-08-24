import { supabase } from './supabase';
import { NOTIFICATION_CENTER_DAYS, normalizeNotificationCenterRows } from './notificationCenterModel.js';

export async function listNotifications({ familyId, userId, days = NOTIFICATION_CENTER_DAYS }) {
  if (!userId) return [];
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from('notifications')
    .select('id, family_id, category, title, body, deep_link, thumbnail_url, metadata, created_at, read_at')
    .eq('user_id', userId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(100);
  if (familyId) query = query.or(`family_id.eq.${familyId},family_id.is.null`);
  const { data, error } = await query;
  if (error) {
    if (!isMissingNotificationsTable(error)) console.warn('listNotifications', error.message);
    return [];
  }
  return normalizeNotificationCenterRows(data);
}

export async function hasUnreadNotifications({ familyId, userId }) {
  if (!userId) return false;
  let query = supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  if (familyId) query = query.or(`family_id.eq.${familyId},family_id.is.null`);
  const { count, error } = await query;
  if (error) {
    if (!isMissingNotificationsTable(error)) console.warn('hasUnreadNotifications', error.message);
    return false;
  }
  return (count || 0) > 0;
}

export async function markNotificationsRead({ familyId, userId }) {
  if (!userId) return;
  let query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (familyId) query = query.or(`family_id.eq.${familyId},family_id.is.null`);
  const { error } = await query;
  if (error && !isMissingNotificationsTable(error)) throw error;
}

function isMissingNotificationsTable(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || (message.includes('notifications')
      && (message.includes('does not exist') || message.includes('not find') || message.includes('schema cache')));
}

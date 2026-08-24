import { supabase } from './supabase';

export async function listFamilyLibraryConnections(familyId) {
  if (!familyId) return [];
  const { data, error } = await supabase
    .from('family_library_connections')
    .select('family_id, user_id, discovery_enabled, status, last_scan_at, last_success_at, surfaced_count, saved_count, updated_at')
    .eq('family_id', familyId);
  if (error) {
    if (!isMissingTable(error)) console.warn('listFamilyLibraryConnections', error.message);
    return [];
  }
  return data || [];
}

export async function publishFamilyLibraryConnection({
  familyId,
  userId,
  status,
  surfacedCount = 0,
  savedCount = 0,
  completedAt = null,
} = {}) {
  if (!familyId || !userId || !status) return null;
  const now = completedAt || new Date().toISOString();
  const payload = {
    family_id: familyId,
    user_id: userId,
    discovery_enabled: true,
    status,
    last_scan_at: now,
    surfaced_count: Math.max(0, Number(surfacedCount || 0)),
    saved_count: Math.max(0, Number(savedCount || 0)),
  };
  if (status === 'ready') payload.last_success_at = now;
  const { data, error } = await supabase
    .from('family_library_connections')
    .upsert(payload, { onConflict: 'family_id,user_id' })
    .select()
    .single();
  if (error) {
    if (!isMissingTable(error)) console.warn('publishFamilyLibraryConnection', error.message);
    return null;
  }
  return data;
}

export async function resetFamilyLibraryConnection({ familyId, userId } = {}) {
  if (!familyId || !userId) return;
  const { error } = await supabase
    .from('family_library_connections')
    .delete()
    .eq('family_id', familyId)
    .eq('user_id', userId);
  if (error && !isMissingTable(error)) throw error;
}

function isMissingTable(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || (message.includes('family_library_connections') && message.includes('schema cache'));
}

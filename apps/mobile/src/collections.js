import { listMomentArchiveByIds } from './moments';
import { supabase } from './supabase';

export const COLLECTION_SUMMARY_LIMIT = 80;
export const COLLECTION_MOMENT_PAGE_SIZE = 60;
export const COLLECTION_MEMBERSHIP_SCAN_LIMIT = 5000;

export async function listAutomaticCollections(familyId, { limit = COLLECTION_SUMMARY_LIMIT } = {}) {
  if (!familyId) return [];
  const bounded = Math.max(1, Math.min(COLLECTION_SUMMARY_LIMIT, Number(limit || COLLECTION_SUMMARY_LIMIT)));
  const { data, error } = await supabase
    .from('family_collection_summaries')
    .select('id, family_id, collection_key, kind, title, source_code, source_ref, confidence_band, model_version, moment_count, latest_captured_at')
    .eq('family_id', familyId)
    .order('moment_count', { ascending: false })
    .order('title', { ascending: true })
    .limit(bounded);
  if (error) throw error;
  return data || [];
}

export async function listCollectionMomentIds(familyId, collectionId, {
  limit = COLLECTION_MEMBERSHIP_SCAN_LIMIT,
} = {}) {
  if (!familyId || !collectionId) return [];
  const bounded = Math.max(0, Math.min(COLLECTION_MEMBERSHIP_SCAN_LIMIT, Number(limit || 0)));
  const ids = [];
  for (let offset = 0; offset < bounded; offset += 500) {
    const take = Math.min(500, bounded - offset);
    const { data, error } = await supabase
      .from('family_collection_moments')
      .select('moment_id, captured_at')
      .eq('family_id', familyId)
      .eq('collection_id', collectionId)
      .order('captured_at', { ascending: false })
      .order('moment_id', { ascending: false })
      .range(offset, offset + take - 1);
    if (error) throw error;
    const page = data || [];
    ids.push(...page.map((row) => row.moment_id).filter(Boolean));
    if (page.length < take) break;
  }
  return ids;
}

export async function listCollectionMoments(familyId, collectionId, {
  offset = 0,
  limit = COLLECTION_MOMENT_PAGE_SIZE,
} = {}) {
  if (!familyId || !collectionId) return [];
  const bounded = Math.max(1, Math.min(COLLECTION_MOMENT_PAGE_SIZE, Number(limit || COLLECTION_MOMENT_PAGE_SIZE)));
  const safeOffset = Math.max(0, Number(offset || 0));
  const { data, error } = await supabase
    .from('family_collection_moments')
    .select('moment_id, captured_at')
    .eq('family_id', familyId)
    .eq('collection_id', collectionId)
    .order('captured_at', { ascending: false })
    .order('moment_id', { ascending: false })
    .range(safeOffset, safeOffset + bounded - 1);
  if (error) throw error;
  const ids = (data || []).map((row) => row.moment_id).filter(Boolean);
  return listMomentArchiveByIds(familyId, ids);
}

export async function applyMomentCollectionChoices({ familyId, momentId, availableKeys, selectedKeys }) {
  if (!familyId || !momentId) throw new Error('Missing collection target');
  const { error } = await supabase.rpc('apply_moment_collection_choices', {
    target_family_id: familyId,
    target_moment_id: momentId,
    available_collection_keys: [...new Set((availableKeys || []).filter(Boolean))],
    selected_collection_keys: [...new Set((selectedKeys || []).filter(Boolean))],
  });
  if (error) throw error;
}

export async function setCollectionMembershipVisible({ familyId, collectionId, momentId, visible }) {
  if (!familyId || !collectionId || !momentId) throw new Error('Missing collection membership');
  const { error } = await supabase.rpc('set_collection_membership_visible', {
    target_family_id: familyId,
    target_collection_id: collectionId,
    target_moment_id: momentId,
    visible: !!visible,
  });
  if (error) throw error;
}

import { deleteVoiceNote, ensureMomentVoiceNote } from './moments';
import { supabase } from './supabase';
import {
  chooseSharedTonightLookback,
  SHARED_EVENT_COMPANION_LIMIT,
  SHARED_LOOKBACK_QUERY_LIMIT,
} from './sharedLookbackModel';
import {
  sharedAnnotationExportRanges,
  SHARED_ANNOTATION_EXPORT_LIMIT,
  SHARED_ANNOTATION_EXPORT_PAGE_SIZE,
} from './sharedEnrichmentModel';

export { registerReadySavedFileFingerprint as registerSavedMediaFingerprint } from './savedMediaFingerprint';
export { chooseSharedTonightLookback, SHARED_EVENT_COMPANION_LIMIT, SHARED_LOOKBACK_QUERY_LIMIT };
export { SHARED_ANNOTATION_EXPORT_LIMIT, SHARED_ANNOTATION_EXPORT_PAGE_SIZE };

export async function listMomentAnnotations({ familyId, momentId }) {
  if (!familyId || !momentId) return [];
  const { data, error } = await supabase
    .from('moment_annotations')
    .select('id, family_id, moment_id, author_user_id, annotation_type, body, voice_note_id, created_at, updated_at')
    .eq('family_id', familyId)
    .eq('moment_id', momentId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listFamilyAnnotationExport({ familyId, limit = SHARED_ANNOTATION_EXPORT_LIMIT }) {
  if (!familyId) return [];
  const rows = [];
  for (const range of sharedAnnotationExportRanges({ limit })) {
    const { data, error } = await supabase
      .from('moment_annotations')
      .select('id, moment_id, author_user_id, annotation_type, body, voice_note_id, created_at')
      .eq('family_id', familyId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(range.from, range.to);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < range.take) break;
  }
  return rows;
}

export async function listMomentContextFacts({ familyId, momentId }) {
  if (!familyId || !momentId) return [];
  const { data, error } = await supabase
    .from('moment_context_facts')
    .select('id, fact_type, source_type, source_id, model_version, first:firsts!source_id(id, title, happened_at, done)')
    .eq('family_id', familyId)
    .eq('moment_id', momentId)
    .limit(24);
  if (error) throw error;
  return data || [];
}

export async function listSavedEventCompanions({ familyId, momentId, limit = SHARED_EVENT_COMPANION_LIMIT }) {
  if (!familyId || !momentId) return [];
  const { data, error } = await supabase.rpc('list_saved_event_companions', {
    target_family_id: familyId,
    target_moment_id: momentId,
    result_limit: Math.min(SHARED_EVENT_COMPANION_LIMIT, Math.max(1, Number(limit) || SHARED_EVENT_COMPANION_LIMIT)),
  });
  if (error) throw error;
  return (data || []).map((row) => ({
    eventGroupId: row.event_group_id,
    momentId: row.moment_id,
    momentMediaId: row.moment_media_id,
    ownerUserId: row.owner_user_id,
    ownerLabel: row.owner_label,
    capturedAt: row.captured_at,
  }));
}

export async function ensureMomentTextAnnotation({ familyId, momentId, annotationId, body }) {
  const userId = await currentUserId();
  const clean = String(body || '').trim();
  if (!familyId || !momentId || !annotationId || !clean) throw new Error('Text annotation is incomplete');
  const { data, error } = await supabase.from('moment_annotations').upsert({
    id: annotationId,
    family_id: familyId,
    moment_id: momentId,
    author_user_id: userId,
    annotation_type: 'text',
    body: clean,
    voice_note_id: null,
  }, { onConflict: 'id' }).select('id, annotation_type, body, author_user_id, created_at').single();
  if (error) throw error;
  return data;
}

export async function ensureMomentVoiceAnnotation({
  familyId,
  momentId,
  annotationId,
  voice,
  voiceNoteId,
  voiceObjectId,
}) {
  const userId = await currentUserId();
  if (!annotationId) throw new Error('Voice annotation retry identity is required');
  await ensureMomentVoiceNote({ familyId, momentId, voice, voiceNoteId, voiceObjectId });
  const { data, error } = await supabase.from('moment_annotations').upsert({
    id: annotationId,
    family_id: familyId,
    moment_id: momentId,
    author_user_id: userId,
    annotation_type: 'voice',
    body: null,
    voice_note_id: voiceNoteId,
  }, { onConflict: 'id' }).select('id, annotation_type, voice_note_id, author_user_id, created_at').single();
  if (error) throw error;
  return data;
}

export async function removeMomentAnnotation({ familyId, momentId, annotation }) {
  if (!familyId || !momentId || !annotation?.id) return;
  if (annotation.annotation_type === 'voice' && annotation.voice_note_id) {
    await deleteVoiceNote({ familyId, momentId, voiceNoteId: annotation.voice_note_id });
    return;
  }
  const { error } = await supabase.from('moment_annotations').delete()
    .eq('family_id', familyId).eq('moment_id', momentId).eq('id', annotation.id);
  if (error) throw error;
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error('Not signed in');
  return data.user.id;
}

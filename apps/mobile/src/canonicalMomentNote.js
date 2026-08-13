const UNCONFIRMED_NOTE_WRITE = 'Canonical memory note write was not confirmed';

/**
 * Writes parent-approved Tonight words to the canonical memory and confirms
 * that the exact family-scoped row contains the normalized value. PostgREST
 * updates that affect zero rows must never be treated as a completed step.
 */
export async function saveCanonicalMomentNote({
  client,
  familyId,
  momentId,
  note,
  now = new Date(),
}) {
  if (!client || !familyId || !momentId) throw new Error('Missing canonical memory note scope');
  const captionNote = String(note || '').trim() || null;
  const { data, error } = await client
    .from('moments')
    .update({
      caption_note: captionNote,
      updated_at: now.toISOString(),
    })
    .eq('family_id', familyId)
    .eq('id', momentId)
    .select('id, family_id, caption_note')
    .single();

  if (error) throw error;
  if (
    data?.id !== momentId
    || data?.family_id !== familyId
    || (data?.caption_note ?? null) !== captionNote
  ) {
    throw new Error(UNCONFIRMED_NOTE_WRITE);
  }
  return data;
}

export function isMissingPostgrestRelationship(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  return code === 'PGRST200'
    || /could not find a relationship between/i.test(message)
    || (/relationship/i.test(message) && /schema cache/i.test(message));
}

export async function readPostgrestRelationshipCompatible({
  familyId,
  embeddedSelect,
  baseSelect,
  createQuery,
  applyQuery,
  attachRelations,
} = {}) {
  if (!familyId) return [];
  if (!embeddedSelect || !baseSelect || !createQuery || !applyQuery || !attachRelations) {
    throw new Error('Incomplete PostgREST relationship-compatible read');
  }

  const execute = (select) => applyQuery(
    createQuery(select).eq('family_id', familyId),
  );
  const embedded = await execute(embeddedSelect);
  if (!embedded?.error) return rowsFromResult(embedded?.data);
  if (!isMissingPostgrestRelationship(embedded.error)) throw embedded.error;

  const base = await execute(baseSelect);
  if (base?.error) throw base.error;
  const rows = rowsFromResult(base?.data);
  return rows.length ? attachRelations(familyId, rows) : [];
}

export async function readChronologicalPostgrestRelationshipCompatible({
  familyId,
  embeddedSelect,
  baseSelect,
  createQuery,
  applyQuery = async (query) => query,
  attachRelations,
  limit = 60,
  capturedOnOrAfter = null,
  capturedBefore = null,
} = {}) {
  return readPostgrestRelationshipCompatible({
    familyId,
    embeddedSelect,
    baseSelect,
    createQuery: (select) => {
      let query = createQuery(select)
        .eq('upload_status', 'ready')
        .not('creation_time', 'is', null)
        .order('creation_time', { ascending: true, nullsFirst: false })
        .order('asset_owner_user_id', { ascending: true })
        .order('asset_id', { ascending: true })
        .limit(limit);
      if (capturedOnOrAfter) query = query.gte('creation_time', capturedOnOrAfter);
      if (capturedBefore) query = query.lt('creation_time', capturedBefore);
      return query;
    },
    applyQuery,
    attachRelations,
  });
}

export async function readLatestTaggedPostgrestRelationshipCompatible({
  familyId,
  embeddedSelect,
  baseSelect,
  createQuery,
  applyQuery = async (query) => query,
  attachRelations,
} = {}) {
  return readPostgrestRelationshipCompatible({
    familyId,
    embeddedSelect,
    baseSelect,
    createQuery: (select) => createQuery(select)
      .eq('upload_status', 'ready')
      .order('tagged_at', { ascending: false, nullsFirst: false })
      .order('asset_owner_user_id', { ascending: true })
      .order('asset_id', { ascending: true })
      .limit(1),
    applyQuery,
    attachRelations,
  });
}

function rowsFromResult(data) {
  if (Array.isArray(data)) return data;
  return data ? [data] : [];
}

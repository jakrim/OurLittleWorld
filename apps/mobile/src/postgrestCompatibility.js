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

function rowsFromResult(data) {
  if (Array.isArray(data)) return data;
  return data ? [data] : [];
}

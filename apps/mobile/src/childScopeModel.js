export function normalizeChildId(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

export function childScopeContext(childId) {
  const normalized = normalizeChildId(childId);
  return {
    childId: normalized,
    childScoped: Boolean(normalized),
  };
}

export function childIdForRow(row) {
  if (!row || typeof row !== 'object') return null;
  return normalizeChildId(
    row.child_id
      ?? row.childId
      ?? row.child?.id
      ?? row.child?.child_id
      ?? row.metadata?.child_id
      ?? row.metadata?.childId
      ?? row.moment_media?.metadata?.child_id
      ?? row.moment_media?.metadata?.childId,
  );
}

export function rowMatchesChildScope(row, childId, { includeUnscoped = true } = {}) {
  const targetChildId = normalizeChildId(childId);
  if (!targetChildId) return true;
  const rowChildId = childIdForRow(row);
  if (!rowChildId) return includeUnscoped;
  return rowChildId === targetChildId;
}

export function filterRowsForChildScope(rows = [], childId, options = {}) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => rowMatchesChildScope(row, childId, options));
}

function taggedAtMs(row) {
  if (!row?.tagged_at) return 0;
  const value = new Date(row.tagged_at).getTime();
  return Number.isFinite(value) ? value : 0;
}

function taggedIdentity(row) {
  if (!row?.family_id || !row?.asset_id) return null;
  return `${row.family_id}:${row.asset_owner_user_id || ''}:${row.asset_id}`;
}

export function latestReadyTaggedRow(rows = []) {
  return (rows || []).reduce((latest, row) => {
    if (row?.upload_status !== 'ready' || !taggedIdentity(row) || !taggedAtMs(row)) return latest;
    if (!latest || taggedAtMs(row) > taggedAtMs(latest)) return row;
    return latest;
  }, null);
}

// Bounded archive reads stay capture-time ordered. The one separately queried
// latest Keep is merged without reordering that archive, so Today/Our World can
// acknowledge the parent's action even when its grounded capture date is old.
export function mergeLatestReadyTaggedRow(rows = [], latest = null) {
  const bounded = [...(rows || [])];
  if (latest?.upload_status !== 'ready') return bounded;
  const latestIdentity = taggedIdentity(latest);
  if (!latestIdentity || !taggedAtMs(latest)) return bounded;
  const existingIndex = bounded.findIndex((row) => taggedIdentity(row) === latestIdentity);
  if (existingIndex >= 0) {
    bounded[existingIndex] = { ...bounded[existingIndex], ...latest };
    return bounded;
  }
  return [...bounded, latest];
}

export function normalizeMomentTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of tags) {
    const tag = String(raw || '').trim().replace(/^#+/, '').trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function formatTagLabel(tag) {
  const clean = String(tag || '').trim();
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

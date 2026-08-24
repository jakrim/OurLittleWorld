export function formatMilestoneDisplayTitle(title) {
  const clean = String(title || '').trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

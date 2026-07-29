export function redemptionAnalyticsProperties(entitlement) {
  const source = String(entitlement?.source || '');
  if (source === 'stripe') return { redemption_type: 'website', plan_state_after: 'active' };
  if (source === 'partner') return { redemption_type: 'partner', plan_state_after: 'active' };
  if (source === 'gift') return { redemption_type: 'gift', plan_state_after: 'gift' };
  return { redemption_type: 'gift', plan_state_after: 'unknown' };
}

export function redemptionStatus(entitlement, fallback) {
  return typeof entitlement?.message === 'string' && entitlement.message.trim()
    ? entitlement.message.trim()
    : fallback;
}

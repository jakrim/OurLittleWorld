const PRODUCTION_PROJECT_REF = 'baxgullapuksjbzkogii';

export function isLocalSupabaseUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(String(value));
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function isApprovedHostedQaSupabaseUrl(value, expectedProjectRef) {
  const expected = String(expectedProjectRef || '').trim().toLowerCase();
  if (!expected || expected === PRODUCTION_PROJECT_REF) return false;
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:'
      && url.hostname === `${expected}.supabase.co`;
  } catch {
    return false;
  }
}

export function isApprovedRealWriteQaTarget(value, expectedProjectRef) {
  return isLocalSupabaseUrl(value)
    || isApprovedHostedQaSupabaseUrl(value, expectedProjectRef);
}

export function describeSupabaseTarget(value) {
  if (!value) return 'missing Supabase URL';
  try {
    const url = new URL(String(value));
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'invalid Supabase URL';
  }
}

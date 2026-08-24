export function isLocalSupabaseUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(String(value));
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
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

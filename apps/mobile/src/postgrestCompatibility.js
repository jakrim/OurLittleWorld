export function isMissingPostgrestRelationship(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  return code === 'PGRST200'
    || /could not find a relationship between/i.test(message)
    || (/relationship/i.test(message) && /schema cache/i.test(message));
}

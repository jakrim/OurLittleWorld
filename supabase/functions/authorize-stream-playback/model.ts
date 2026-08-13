const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STREAM_UID = /^[A-Za-z0-9._-]{1,255}$/;

export function canonicalStreamAuthorizationInput(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const familyId = String(record.familyId || record.family_id || '').trim();
  const userId = String(record.userId || record.user_id || '').trim();
  const providerObjectId = String(record.providerObjectId || record.provider_object_id || '').trim();
  if (!UUID.test(familyId) || !UUID.test(userId) || !STREAM_UID.test(providerObjectId)) return null;
  return { familyId, userId, providerObjectId };
}

export async function safeSecretEqual(left: string, right: string) {
  if (!left || !right) return false;
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

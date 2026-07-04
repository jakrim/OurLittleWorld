import {
  HttpError,
  corsHeaders,
  errorResponse,
  json,
  readJson,
  requireUser,
  requiredEnv,
  restSelect,
} from '../_shared/billing.ts';

/**
 * Issues a short-lived media session token (plan: "R2 And Worker Media
 * Gateway"). The Worker validates it locally with the shared secret, so
 * media requests never hit Supabase.
 *
 * Token: base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)
 * Payload: { f: familyId, u: userId, t: storageTier, exp: unixSeconds }
 */

const SESSION_TTL_SECONDS = 20 * 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const { user } = await requireUser(req);
    const body = await readJson(req);
    const familyId = String(body.familyId || body.family_id || '').trim();
    if (!familyId) throw new HttpError(400, 'Family is required.');

    const rows = await restSelect(
      'family_members',
      `family_id=eq.${encodeURIComponent(familyId)}&user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,
    );
    if (!Array.isArray(rows) || !rows[0]?.role) {
      throw new HttpError(403, 'Not a member of this family.');
    }

    const entitlementRows = await restSelect(
      'family_entitlements',
      `family_id=eq.${encodeURIComponent(familyId)}&select=storage_tier,status&limit=1`,
    );
    const tier = entitlementRows?.[0]?.storage_tier || 'family';

    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    const payload = { f: familyId, u: user.id, t: tier, exp };
    const token = await signMediaSession(payload);

    return json({
      token,
      familyId,
      tier,
      expiresAt: new Date(exp * 1000).toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

async function signMediaSession(payload: Record<string, unknown>) {
  const secret = requiredEnv('MEDIA_SESSION_SECRET');
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${base64url(new Uint8Array(signature))}`;
}

function base64url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

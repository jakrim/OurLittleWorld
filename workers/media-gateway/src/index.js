/**
 * OLW media gateway Worker.
 *
 * URL pattern: /media/{family_id}/{variant}/{object_id}
 *   variant: "original" (R2 object) | "stream" (redirect to Stream playback)
 *
 * Auth: ?session=<token> issued by the create-media-session Edge Function.
 * The token is validated locally (HMAC with the shared MEDIA_SESSION_SECRET);
 * the Worker never calls Supabase per media request. Responses are cached by
 * object key + variant — never by bearer token.
 */

const VARIANTS = new Set(['original', 'stream']);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/media\/([0-9a-f-]{36})\/([a-z_]+)\/([A-Za-z0-9._-]+)$/);
    if (!match) return withMetrics(new Response('Not found', { status: 404 }), 'miss');
    const [, familyId, variant, objectId] = match;

    if (!VARIANTS.has(variant)) {
      return withMetrics(new Response('Unsupported variant', { status: 400 }), 'miss');
    }

    // 1-2. Validate the session token locally and match the URL family.
    const session = await verifySession(url.searchParams.get('session') || '', env.MEDIA_SESSION_SECRET);
    if (!session) return withMetrics(new Response('Invalid media session', { status: 401 }), 'denied');
    if (session.f !== familyId) return withMetrics(new Response('Family mismatch', { status: 403 }), 'denied');

    // 3. Variant gating: originals require a tier with originals enabled.
    if (variant === 'original' && session.t !== 'vault') {
      return withMetrics(new Response('Original backup is not included in this plan', { status: 403 }), 'denied');
    }

    // 5. Stream playback: redirect to a signed HLS manifest. Videos are
    // uploaded with requireSignedURLs, so the raw UID URL never plays —
    // only tokens minted here (after session auth) do.
    if (variant === 'stream') {
      if (!env.STREAM_CUSTOMER_DOMAIN) {
        return withMetrics(new Response('Stream is not configured', { status: 503 }), 'miss');
      }
      const playbackToken = await signStreamToken(objectId, env);
      const path = playbackToken || objectId;
      const playback = `https://${env.STREAM_CUSTOMER_DOMAIN}/${path}/manifest/video.m3u8`;
      return withMetrics(Response.redirect(playback, 302), 'redirect');
    }

    // 4. Cache by object key + variant after auth (never by token).
    const cacheKey = new Request(`https://cache.olw/media/${familyId}/${variant}/${objectId}`);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return withMetrics(new Response(cached.body, cached), 'hit');

    const object = await env.ORIGINALS.get(`${familyId}/${objectId}`);
    if (!object) return withMetrics(new Response('Object not found', { status: 404 }), 'miss');

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'private, max-age=3600');
    const response = new Response(object.body, { headers });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return withMetrics(response, 'miss');
  },
};

async function verifySession(token, secret) {
  try {
    if (!token || !secret) return null;
    const [body, signature] = token.split('.');
    if (!body || !signature) return null;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64urlToBytes(signature),
      new TextEncoder().encode(body),
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(body)));
    if (!payload?.f || !payload?.exp) return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Signs a short-lived Stream playback JWT (RS256 with the account signing
// key). Returns null when signing is not configured, falling back to the
// bare UID (which only works for videos without requireSignedURLs).
async function signStreamToken(videoUid, env) {
  try {
    if (!env.STREAM_SIGNING_KEY_ID || !env.STREAM_SIGNING_JWK) return null;
    const jwk = JSON.parse(new TextDecoder().decode(base64urlToBytes(env.STREAM_SIGNING_JWK)));
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const enc = (obj) => base64urlFromBytes(new TextEncoder().encode(JSON.stringify(obj)));
    const header = enc({ alg: 'RS256', kid: env.STREAM_SIGNING_KEY_ID });
    const payload = enc({
      sub: videoUid,
      kid: env.STREAM_SIGNING_KEY_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    return `${header}.${payload}.${base64urlFromBytes(new Uint8Array(signature))}`;
  } catch {
    return null;
  }
}

function base64urlFromBytes(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// 6. Emit cache hit/miss/request outcomes for the metrics pipeline.
function withMetrics(response, outcome) {
  const out = new Response(response.body, response);
  out.headers.set('x-olw-cache', outcome);
  return out;
}

function base64urlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

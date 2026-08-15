/**
 * OLW media gateway Worker.
 *
 * URL pattern: /media/{family_id}/{variant}/{object_id}
 *   variant: "original" (R2 object) | "stream" (redirect to Stream playback)
 *
 * Auth: ?session=<token> issued by the create-media-session Edge Function.
 * The token is validated locally (HMAC with the shared MEDIA_SESSION_SECRET).
 * Stream requests additionally use a trusted family/media lookup before a
 * provider capability is minted. Responses are cached by object key + variant
 * — never by bearer token.
 */

import { accountDeletionMarkerKey, handleAccountDeletion } from './accountDeletion.js';

const VARIANTS = new Set(['original', 'stream']);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/internal/account-deletion') {
      return handleAccountDeletion(request, env);
    }
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

    // A deletion marker overrides previously issued media sessions before any
    // provider capability is minted or any cached object is returned.
    if (await env.ORIGINALS.head(accountDeletionMarkerKey(familyId))) {
      return withMetrics(new Response('Family media was deleted', { status: 410 }), 'denied');
    }

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
      const authorized = await authorizeStreamPlayback(familyId, session.u, objectId, env);
      if (!authorized) {
        return withMetrics(new Response('Media not found', { status: 404 }), 'denied');
      }
      const playbackToken = await signStreamToken(objectId, env, session.exp);
      if (!playbackToken) {
        return withMetrics(new Response('Stream playback is unavailable', { status: 503 }), 'miss');
      }
      const playback = `https://${env.STREAM_CUSTOMER_DOMAIN}/${playbackToken}/manifest/video.m3u8`;
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

export async function authorizeStreamPlayback(familyId, userId, objectId, env) {
  try {
    if (!env.STREAM_AUTHORIZATION_URL || !env.SUPABASE_ANON_KEY || !env.MEDIA_GATEWAY_AUTH_SECRET) {
      return false;
    }
    const response = await fetch(
      env.STREAM_AUTHORIZATION_URL,
      {
        method: 'POST',
        redirect: 'error',
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          'content-type': 'application/json',
          'x-olw-media-gateway-secret': env.MEDIA_GATEWAY_AUTH_SECRET,
        },
        body: JSON.stringify({
          family_id: familyId,
          user_id: userId,
          provider_object_id: objectId,
        }),
      },
    );
    const payload = await response.json().catch(() => null);
    const authorized = response.ok && payload?.authorized === true;
    if (!authorized) {
      console.log(JSON.stringify({ event: 'stream_authorization_denied',
        edgeStatus: response.status,
        edgeAuthorized: payload?.authorized === true,
      }));
    }
    return authorized;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    const errorClass = message.includes('redirect')
      ? 'redirect'
      : message.includes('invalid url') || message.includes('valid url')
        ? 'invalid_url'
        : message.includes('header')
          ? 'header'
          : message.includes('network')
            ? 'network'
            : message.includes('fetch')
              ? 'fetch'
              : 'other';
    console.log(JSON.stringify({
      event: 'stream_authorization_error',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorCode: typeof error?.cause?.code === 'string' ? error.cause.code : null,
      errorClass,
    }));
    return false;
  }
}

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
    const expiresAt = Number(payload?.exp);
    if (!payload?.f || !payload?.u || !Number.isFinite(expiresAt)) return null;
    if (expiresAt * 1000 < Date.now()) return null;
    payload.exp = expiresAt;
    return payload;
  } catch {
    return null;
  }
}

// Signs a short-lived Stream playback JWT (RS256 with the account signing
// key). Returns null when signing is not configured; callers fail closed and
// never expose a bare provider UID as a playback capability.
async function signStreamToken(videoUid, env, sessionExpiresAt) {
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
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload = enc({
      sub: videoUid,
      kid: env.STREAM_SIGNING_KEY_ID,
      // Videos are currently capped at two minutes. A five-minute playback
      // capability is enough for completion and never outlives its session.
      exp: Math.min(Number(sessionExpiresAt), nowSeconds + 5 * 60),
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

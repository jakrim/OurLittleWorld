import { assertEquals, assertMatch } from 'jsr:@std/assert@1';

import worker, { authorizeStreamPlayback } from './index.js';

const FAMILY_A = '10000000-0000-4000-8000-000000000001';
const FAMILY_B = '20000000-0000-4000-8000-000000000002';
const SESSION_USER = '30000000-0000-4000-8000-000000000003';
const STREAM_A = 'stream-owned-by-family-a';

Deno.test('a family session cannot mint playback for another family Stream UID', async () => {
  const previousFetch = globalThis.fetch;
  let requested = null;
  globalThis.fetch = async (_url, init) => {
    requested = JSON.parse(init.body);
    return new Response('{"authorized":false}', { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const secret = 'media-session-test-secret';
    const response = await worker.fetch(
      new Request(`https://worker.test/media/${FAMILY_B}/stream/${STREAM_A}?session=${await mediaSession(FAMILY_B, secret)}`),
      {
        MEDIA_SESSION_SECRET: secret,
        STREAM_CUSTOMER_DOMAIN: 'customer.example.test',
        STREAM_AUTHORIZATION_URL: 'https://supabase.example.test/functions/v1/authorize-stream-playback',
        SUPABASE_ANON_KEY: 'public-anon-test-key',
        MEDIA_GATEWAY_AUTH_SECRET: 'dedicated-gateway-test-secret',
        ORIGINALS: { head: () => null },
      },
      { waitUntil: () => {} },
    );

    assertEquals(requested, {
      target_family_id: FAMILY_B,
      target_user_id: SESSION_USER,
      p_provider_object_id: STREAM_A,
    });
    assertEquals(response.status, 404);
    assertEquals(response.headers.get('x-olw-cache'), 'denied');
    assertEquals(response.headers.get('location'), null);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

Deno.test('Stream authorization uses narrow Edge auth and fails closed on backend errors', async () => {
  const previousFetch = globalThis.fetch;
  let headers = null;
  globalThis.fetch = async (_url, init) => {
    headers = new Headers(init.headers);
    return new Response('unavailable', { status: 503 });
  };

  try {
    assertEquals(await authorizeStreamPlayback(FAMILY_A, SESSION_USER, STREAM_A, {
      STREAM_AUTHORIZATION_URL: 'https://supabase.example.test/functions/v1/authorize-stream-playback',
      SUPABASE_ANON_KEY: 'public-anon-test-key',
      MEDIA_GATEWAY_AUTH_SECRET: 'dedicated-gateway-test-secret',
    }), false);
    assertEquals(headers.get('apikey'), 'public-anon-test-key');
    assertEquals(headers.get('authorization'), 'Bearer public-anon-test-key');
    assertEquals(headers.get('x-olw-media-gateway-secret'), 'dedicated-gateway-test-secret');
    assertEquals(await authorizeStreamPlayback(FAMILY_A, SESSION_USER, STREAM_A, {}), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

Deno.test('an exactly published family Stream UID receives signed playback only', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"authorized":true}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  const signingKeys = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const privateJwk = await crypto.subtle.exportKey('jwk', signingKeys.privateKey);

  try {
    const secret = 'media-session-test-secret';
    const response = await worker.fetch(
      new Request(`https://worker.test/media/${FAMILY_A}/stream/${STREAM_A}?session=${await mediaSession(FAMILY_A, secret)}`),
      {
        MEDIA_SESSION_SECRET: secret,
        STREAM_CUSTOMER_DOMAIN: 'customer.example.test',
        STREAM_SIGNING_KEY_ID: 'test-key',
        STREAM_SIGNING_JWK: base64url(new TextEncoder().encode(JSON.stringify(privateJwk))),
        STREAM_AUTHORIZATION_URL: 'https://supabase.example.test/functions/v1/authorize-stream-playback',
        SUPABASE_ANON_KEY: 'public-anon-test-key',
        MEDIA_GATEWAY_AUTH_SECRET: 'dedicated-gateway-test-secret',
        ORIGINALS: { head: () => null },
      },
      { waitUntil: () => {} },
    );

    assertEquals(response.status, 302);
    assertMatch(response.headers.get('location'), /^https:\/\/customer\.example\.test\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/manifest\/video\.m3u8$/);
    const playbackToken = new URL(response.headers.get('location')).pathname.split('/')[1];
    const playbackPayload = JSON.parse(new TextDecoder().decode(fromBase64url(playbackToken.split('.')[1])));
    assertEquals(playbackPayload.exp <= Math.floor(Date.now() / 1000) + 65, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

async function mediaSession(familyId, secret) {
  const body = base64url(new TextEncoder().encode(JSON.stringify({
    f: familyId,
    u: SESSION_USER,
    t: 'family',
    exp: Math.floor(Date.now() / 1000) + 60,
  })));
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

function base64url(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

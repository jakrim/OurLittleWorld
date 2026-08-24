#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';

const status = parseEnv(execFileSync('supabase', ['status', '-o', 'env'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
}));
const apiUrl = required(status, 'API_URL');
const restUrl = required(status, 'REST_URL');
const functionsUrl = required(status, 'FUNCTIONS_URL');
const mailpitUrl = required(status, 'MAILPIT_URL');
const anonKey = required(status, 'ANON_KEY');
const serviceRoleKey = required(status, 'SERVICE_ROLE_KEY');

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(`${apiUrl}/`)) {
  throw new Error('Account deletion QA is local-only and refused a non-local Supabase URL.');
}

const runToken = randomBytes(6).toString('hex');
const targetEmail = `delete-target-${runToken}@example.test`;
const remainingEmail = `delete-remaining-${runToken}@example.test`;
const password = `Local-only-${randomBytes(18).toString('base64url')}!`;
const soleFamilyId = randomUUID();
const sharedFamilyId = randomUUID();
const sharedMomentId = randomUUID();
const soleObjectPath = `${soleFamilyId}/synthetic/deletion-proof.txt`;
const sharedObjectPath = `${sharedFamilyId}/synthetic/preserved-proof.txt`;
const created = {
  targetUserId: null,
  remainingUserId: null,
};

try {
  created.targetUserId = (await authAdmin('/users', {
    method: 'POST',
    body: { email: targetEmail, password, email_confirm: true },
  })).id;
  created.remainingUserId = (await authAdmin('/users', {
    method: 'POST',
    body: { email: remainingEmail, password, email_confirm: true },
  })).id;

  await restInsert('families', [
    { id: soleFamilyId, name: 'Synthetic sole family', baby_name: 'Synthetic', created_by: created.targetUserId },
    { id: sharedFamilyId, name: 'Synthetic shared family', baby_name: 'Synthetic', created_by: created.remainingUserId },
  ]);
  await restInsert('family_members', [
    { family_id: soleFamilyId, user_id: created.targetUserId, display_name: 'Target', role: 'creator' },
    { family_id: sharedFamilyId, user_id: created.targetUserId, display_name: 'Target', role: 'partner' },
    { family_id: sharedFamilyId, user_id: created.remainingUserId, display_name: 'Remaining', role: 'creator' },
  ]);
  await restInsert('family_entitlements', [
    { family_id: soleFamilyId, status: 'active', source: 'admin', plan_key: 'comp_year' },
    { family_id: sharedFamilyId, status: 'active', source: 'admin', plan_key: 'comp_year' },
  ]);
  await restInsert('moments', [{
    id: sharedMomentId,
    family_id: sharedFamilyId,
    author_user_id: created.targetUserId,
    title: 'Synthetic shared deletion proof',
    captured_at: new Date().toISOString(),
  }]);
  await uploadObject(soleObjectPath, 'synthetic sole-family object');
  await uploadObject(sharedObjectPath, 'synthetic shared-family object');

  const session = await authPublic('/token?grant_type=password', {
    method: 'POST',
    body: { email: targetEmail, password },
  });
  const preview = await invokeDeletion(session.access_token, { action: 'preview' });
  assert(preview?.preview?.soleWriterCount === 1, 'preview did not identify the sole-writer family');
  assert(preview?.preview?.additionalWriterCount === 1, 'preview did not identify the shared-writer family');

  const otpRequestedAt = Date.now();
  await authPublic('/otp', {
    method: 'POST',
    body: { email: targetEmail, create_user: false },
  });
  const otp = await waitForOtp(targetEmail, otpRequestedAt);
  const deleted = await invokeDeletion(session.access_token, {
    action: 'delete',
    requestId: randomUUID(),
    email: targetEmail,
    otp,
    confirmation: 'DELETE',
  });
  assert(deleted?.completed === true, 'Edge deletion did not report completion');

  const soleFamilies = await restSelect('families', `id=eq.${soleFamilyId}&select=id`);
  const sharedFamilies = await restSelect('families', `id=eq.${sharedFamilyId}&select=id`);
  const remainingMembership = await restSelect(
    'family_members',
    `family_id=eq.${sharedFamilyId}&user_id=eq.${created.remainingUserId}&select=user_id`,
  );
  const targetMemberships = await restSelect(
    'family_members',
    `user_id=eq.${created.targetUserId}&select=user_id`,
  );
  const sharedMoments = await restSelect(
    'moments',
    `id=eq.${sharedMomentId}&select=id,author_user_id`,
  );
  const targetAuthStatus = await authAdminStatus(created.targetUserId);
  const soleObjectStatus = await objectStatus(soleObjectPath);
  const sharedObjectStatus = await objectStatus(sharedObjectPath);

  assert(soleFamilies.length === 0, 'sole-writer family remained');
  assert(sharedFamilies.length === 1, 'shared family was removed');
  assert(remainingMembership.length === 1, 'remaining writer membership was removed');
  assert(targetMemberships.length === 0, 'deleted user membership remained');
  assert(sharedMoments.length === 1 && sharedMoments[0].author_user_id === null, 'shared authorship was not preserved anonymously');
  assert(targetAuthStatus === 404, 'authentication account remained');
  assert(soleObjectStatus !== 200, 'sole-family Storage object remained');
  assert(sharedObjectStatus === 200, 'shared-family Storage object was removed');

  console.log(JSON.stringify({
    gate: 'account_deletion_local_e2e',
    result: 'pass',
    roleCounts: { soleWriter: 1, additionalWriter: 1 },
    authDeleted: true,
    soleFamilyDeleted: true,
    sharedFamilyPreserved: true,
    sharedAuthorshipAnonymized: true,
    soleStorageDeleted: true,
    sharedStoragePreserved: true,
  }));
} finally {
  await deleteObject(soleObjectPath).catch(() => undefined);
  await deleteObject(sharedObjectPath).catch(() => undefined);
  await deleteRest('families', `id=eq.${sharedFamilyId}`).catch(() => undefined);
  if (created.targetUserId) await authAdmin(`/users/${created.targetUserId}`, { method: 'DELETE' }).catch(() => undefined);
  if (created.remainingUserId) await authAdmin(`/users/${created.remainingUserId}`, { method: 'DELETE' }).catch(() => undefined);
}

async function invokeDeletion(accessToken, body) {
  return requestJson(`${functionsUrl}/delete-account`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
    },
    body,
  });
}

async function authPublic(path, init) {
  return requestJson(`${apiUrl}/auth/v1${path}`, {
    ...init,
    headers: { apikey: anonKey },
  });
}

async function authAdmin(path, init) {
  return requestJson(`${apiUrl}/auth/v1/admin${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
}

async function authAdminStatus(userId) {
  const response = await fetch(`${apiUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  return response.status;
}

async function restInsert(table, rows) {
  return requestJson(`${restUrl}/${table}`, {
    method: 'POST',
    headers: serviceHeaders({ Prefer: 'return=minimal' }),
    body: rows,
    allowEmpty: true,
  });
}

async function restSelect(table, query) {
  return requestJson(`${restUrl}/${table}?${query}`, {
    headers: serviceHeaders(),
  });
}

async function deleteRest(table, query) {
  return requestJson(`${restUrl}/${table}?${query}`, {
    method: 'DELETE',
    headers: serviceHeaders({ Prefer: 'return=minimal' }),
    allowEmpty: true,
  });
}

async function uploadObject(path, content) {
  const response = await fetch(`${apiUrl}/storage/v1/object/family-photos/${path}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'text/plain',
      'x-upsert': 'false',
    },
    body: content,
  });
  if (!response.ok) throw new Error(`Synthetic Storage upload failed (${response.status}).`);
}

async function objectStatus(path) {
  const response = await fetch(`${apiUrl}/storage/v1/object/authenticated/family-photos/${path}`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  return response.status;
}

async function deleteObject(path) {
  const response = await fetch(`${apiUrl}/storage/v1/object/family-photos/${path}`, {
    method: 'DELETE',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!response.ok && response.status !== 400 && response.status !== 404) {
    throw new Error(`Synthetic Storage cleanup failed (${response.status}).`);
  }
}

async function waitForOtp(email, requestedAt) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const listing = await requestJson(`${mailpitUrl}/api/v1/messages?limit=50`);
    const candidate = (listing?.messages || []).find((message) =>
      new Date(message.Created || 0).getTime() >= requestedAt - 2000
      && (message.To || []).some((recipient) =>
        String(recipient.Address || recipient).toLowerCase() === email.toLowerCase()
      )
    );
    if (candidate?.ID) {
      const message = await requestJson(`${mailpitUrl}/api/v1/message/${candidate.ID}`);
      const content = `${message?.Text || ''}\n${message?.HTML || ''}`;
      const match = content.match(/(?:token|code)[^0-9]{0,80}(\d{6})/i)
        || content.match(/\b(\d{6})\b/);
      if (match) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Synthetic deletion OTP did not arrive in local Mailpit.');
}

async function requestJson(url, {
  method = 'GET',
  headers = {},
  body,
  allowEmpty = false,
} = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`Local QA request failed at ${new URL(url).pathname} (${response.status}): ${payload?.error || payload?.message || 'unknown error'}`);
  }
  if (!text && !allowEmpty) return null;
  return payload;
}

function serviceHeaders(extra = {}) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

function parseEnv(output) {
  return Object.fromEntries(String(output).split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) return [];
    const value = match[2].replace(/^"(.*)"$/, '$1');
    return [[match[1], value]];
  }));
}

function required(values, key) {
  if (!values[key]) throw new Error(`Local Supabase status did not include ${key}.`);
  return values[key];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

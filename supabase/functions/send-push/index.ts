import {
  HttpError,
  bearerToken,
  corsHeaders,
  env,
  errorResponse,
  json,
  readJson,
  restInsert,
  restSelect,
  supabaseRequest,
} from '../_shared/billing.ts';

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const PUSH_ROUTES = new Set(['/digest', '/prompt', '/review', '/letters', '/firsts', '/invite', '/purchase']);
const PUSH_ROUTE_PREFIXES = ['/moment/'];
const EXPO_CHUNK_SIZE = 100;

type PushTokenRow = {
  expo_push_token: string;
  user_id?: string;
  family_id?: string;
};

type ExpoTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    assertServerCaller(req);
    const body = await readJson(req);
    const route = normalizeNotificationRoute(body.route || body.data?.route);
    if (!route) throw new HttpError(400, 'A supported notification route is required.');

    const title = String(body.title || '').trim();
    const messageBody = String(body.body || '').trim();
    if (!title || !messageBody) throw new HttpError(400, 'Notification title and body are required.');

    const tokenRows = await resolvePushTokens(body);
    const notificationUserIds = await resolveNotificationUserIds(body, tokenRows);
    const notificationCount = await writeNotificationRows({
      body,
      route,
      title,
      messageBody,
      userIds: notificationUserIds,
    });
    if (!tokenRows.length) {
      return json({ sent: 0, ticketCount: 0, receiptCount: 0, pruned: 0, notifications: notificationCount });
    }

    const data = {
      ...(isRecord(body.data) ? body.data : {}),
      route,
    };
    const messages = tokenRows.map((row) => ({
      to: row.expo_push_token,
      title,
      body: messageBody,
      sound: body.sound === false ? undefined : 'default',
      data,
    }));

    const ticketResults = await sendExpoMessages(messages);
    const receiptResults = await fetchExpoReceipts(ticketResults.receiptIds, ticketResults.receiptTokenById);
    const pruneTokens = new Set([
      ...ticketResults.tokensToPrune,
      ...receiptResults.tokensToPrune,
    ]);
    await prunePushTokens([...pruneTokens]);

    return json({
      sent: messages.length,
      ticketCount: ticketResults.ticketCount,
      receiptCount: receiptResults.receiptCount,
      pruned: pruneTokens.size,
      notifications: notificationCount,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

function assertServerCaller(req: Request) {
  const adminSecret = env('OLW_PUSH_ADMIN_SECRET') || env('OLW_BILLING_ADMIN_SECRET');
  if (adminSecret && req.headers.get('x-olw-admin-secret') === adminSecret) return;

  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceRoleKey && bearerToken(req) === serviceRoleKey) return;

  throw new HttpError(403, 'Push sender credentials are required.');
}

async function resolvePushTokens(body: Record<string, unknown>): Promise<PushTokenRow[]> {
  const explicitTokens = uniqueStrings(body.tokens || body.expoPushTokens || body.expo_push_tokens);
  if (explicitTokens.length) {
    return explicitTokens.map((token) => ({ expo_push_token: token }));
  }

  const familyId = String(body.familyId || body.family_id || '').trim();
  const userIds = uniqueStrings(body.userIds || body.user_ids);
  if (!familyId && !userIds.length) {
    throw new HttpError(400, 'Provide tokens, familyId, or userIds.');
  }

  const filters = ['select=expo_push_token,user_id,family_id'];
  if (familyId) filters.push(`family_id=eq.${encodeURIComponent(familyId)}`);
  if (userIds.length) filters.push(`user_id=in.(${userIds.map(encodeURIComponent).join(',')})`);

  let rows;
  try {
    rows = await restSelect('push_tokens', filters.join('&'));
  } catch (err) {
    if (isMissingTable(err, 'push_tokens')) return [];
    throw err;
  }
  if (!Array.isArray(rows)) return [];

  const seen = new Set<string>();
  const out: PushTokenRow[] = [];
  for (const row of rows) {
    const token = String(row?.expo_push_token || '').trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push({
      expo_push_token: token,
      user_id: row?.user_id,
      family_id: row?.family_id,
    });
  }
  return out;
}

async function resolveNotificationUserIds(body: Record<string, unknown>, tokenRows: PushTokenRow[]) {
  const explicitUserIds = uniqueStrings(body.userId || body.user_id || body.userIds || body.user_ids);
  if (explicitUserIds.length) return explicitUserIds;

  const tokenUserIds = uniqueStrings(tokenRows.map((row) => row.user_id));
  if (tokenUserIds.length) return tokenUserIds;

  const familyId = familyIdFromBody(body);
  if (!familyId) return [];
  try {
    const rows = await restSelect(
      'family_members',
      `family_id=eq.${encodeURIComponent(familyId)}&select=user_id,role`,
    );
    const members = Array.isArray(rows) ? rows : [];
    return uniqueStrings(
      members
        .filter((member) => ['creator', 'partner'].includes(String(member.role || '')))
        .map((member) => member.user_id),
    );
  } catch (err) {
    if (isMissingTable(err, 'family_members')) return [];
    throw err;
  }
}

async function writeNotificationRows({
  body,
  route,
  title,
  messageBody,
  userIds,
}: {
  body: Record<string, unknown>;
  route: string;
  title: string;
  messageBody: string;
  userIds: string[];
}) {
  const recipients = uniqueStrings(userIds);
  if (!recipients.length) return 0;

  const data = isRecord(body.data) ? body.data : {};
  const thumbnailUrl = String(body.thumbnailUrl || body.thumbnail_url || data.thumbnailUrl || data.thumbnail_url || '').trim() || null;
  const familyId = familyIdFromBody(body) || null;
  const category = String(body.category || data.category || 'notification').trim() || 'notification';
  const rows = recipients.map((userId) => ({
    family_id: familyId,
    user_id: userId,
    category,
    title,
    body: messageBody,
    deep_link: route,
    thumbnail_url: thumbnailUrl,
    metadata: data,
  }));

  try {
    await restInsert('notifications', rows);
    return rows.length;
  } catch (err) {
    if (isMissingTable(err, 'notifications')) return 0;
    throw err;
  }
}

async function sendExpoMessages(messages: Array<Record<string, unknown>>) {
  const receiptTokenById = new Map<string, string>();
  const tokensToPrune = new Set<string>();
  let ticketCount = 0;

  for (const chunk of chunks(messages, EXPO_CHUNK_SIZE)) {
    const payload = chunk.length === 1 ? chunk[0] : chunk;
    const response = await expoRequest(EXPO_PUSH_SEND_URL, payload);
    const tickets = Array.isArray(response?.data) ? response.data : [response?.data].filter(Boolean);
    ticketCount += tickets.length;

    tickets.forEach((ticket: ExpoTicket, index: number) => {
      const token = String(chunk[index]?.to || '');
      if (ticket?.status === 'ok' && ticket.id) {
        receiptTokenById.set(ticket.id, token);
      } else if (ticket?.details?.error === 'DeviceNotRegistered' && token) {
        tokensToPrune.add(token);
      }
    });
  }

  return {
    receiptIds: [...receiptTokenById.keys()],
    receiptTokenById,
    tokensToPrune,
    ticketCount,
  };
}

async function fetchExpoReceipts(receiptIds: string[], receiptTokenById: Map<string, string>) {
  const tokensToPrune = new Set<string>();
  let receiptCount = 0;
  if (!receiptIds.length) return { tokensToPrune, receiptCount };

  for (const ids of chunks(receiptIds, EXPO_CHUNK_SIZE)) {
    const response = await expoRequest(EXPO_PUSH_RECEIPTS_URL, { ids });
    const receipts = isRecord(response?.data) ? response.data : {};
    receiptCount += Object.keys(receipts).length;
    for (const [receiptId, receipt] of Object.entries(receipts)) {
      const details = isRecord(receipt) && isRecord(receipt.details) ? receipt.details : {};
      if (details.error !== 'DeviceNotRegistered') continue;
      const token = receiptTokenById.get(receiptId);
      if (token) tokensToPrune.add(token);
    }
  }

  return { tokensToPrune, receiptCount };
}

async function expoRequest(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new HttpError(response.status, payload?.errors?.[0]?.message || payload?.message || 'Expo push request failed.');
  }
  return payload;
}

async function prunePushTokens(tokens: string[]) {
  for (const token of tokens) {
    await supabaseRequest(`/rest/v1/push_tokens?expo_push_token=eq.${encodeURIComponent(token)}`, {
      method: 'DELETE',
    });
  }
}

function normalizeNotificationRoute(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || /^(https?:|javascript:|mailto:)/i.test(trimmed)) return null;

  const route = normalizeAppRoute(trimmed);
  const path = route.split(/[?#]/)[0];
  const allowed = PUSH_ROUTES.has(path)
    || PUSH_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix) && path.length > prefix.length);
  return allowed ? route : null;
}

function normalizeAppRoute(value: string) {
  const schemeMatch = value.match(/^[a-z][a-z0-9+.-]*:\/\/(.+)$/i);
  if (!schemeMatch) return value.startsWith('/') ? value : `/${value}`;
  const withoutScheme = schemeMatch[1] || '';
  const slashIndex = withoutScheme.indexOf('/');
  if (slashIndex < 0) return `/${withoutScheme}`;
  return withoutScheme.slice(slashIndex) || '/';
}

function uniqueStrings(value: unknown) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function familyIdFromBody(body: Record<string, unknown>) {
  return String(body.familyId || body.family_id || '').trim();
}

function isMissingTable(error: unknown, table: string) {
  const err = error as { code?: string; message?: string };
  const message = String(err?.message || '').toLowerCase();
  return err?.code === '42P01'
    || err?.code === 'PGRST205'
    || (message.includes(table)
      && (message.includes('does not exist') || message.includes('not find') || message.includes('schema cache')));
}

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

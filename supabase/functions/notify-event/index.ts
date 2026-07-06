import {
  HttpError,
  bearerToken,
  corsHeaders,
  env,
  errorResponse,
  json,
  readJson,
  requireUser,
  restInsert,
  restSelect,
  supabaseRequest,
} from '../_shared/billing.ts';
import {
  CATEGORY_DEFAULTS,
  TRANSACTIONAL_CATEGORY,
  deliveryDecisionFromRows,
  localDayKey,
} from './cadence.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const serverCaller = isServerCaller(req);
    const auth = serverCaller ? null : await requireUser(req);
    const body = await readJson(req);
    const record = isRecord(body.record) ? body.record : body;
    const event = normalizeEvent(record);
    if (!serverCaller && event.actorUserId !== auth?.user.id) {
      throw new HttpError(403, 'Only the actor can send this event.');
    }

    const eventId = await recordEvent(event);
    const recipients = await recipientsForEvent(event);
    const preferences = await preferenceRows(event.familyId, recipients.map((recipient) => recipient.user_id));
    const timeZone = await familyTimeZone(event.familyId);
    const today = localDayKey(new Date(), timeZone);
    const actorName = displayName(recipients.find((row) => row.user_id === event.actorUserId)) || 'Your co-parent';

    let delivered = 0;
    let skipped = 0;
    for (const recipient of recipients) {
      if (recipient.user_id === event.actorUserId && event.category === 'partner_activity') {
        skipped += 1;
        continue;
      }
      const decision = await deliveryDecision({
        event,
        recipientUserId: recipient.user_id,
        preferences,
        today,
        timeZone,
      });
      if (!decision.send) {
        skipped += 1;
        continue;
      }

      const copy = copyForEvent(event, actorName);
      const sent = await sendPush({
        familyId: event.familyId,
        userId: recipient.user_id,
        category: event.category,
        route: event.route,
        title: copy.title,
        body: copy.body,
        eventId,
      });
      if (sent > 0) {
        await recordDelivery({
          event,
          recipientUserId: recipient.user_id,
          batchKey: decision.batchKey,
          deliveryDay: today,
          title: copy.title,
          body: copy.body,
        });
        delivered += 1;
      } else {
        skipped += 1;
      }
    }

    if (eventId) {
      await markEventProcessed(eventId).catch(() => {});
    }

    return json({ delivered, skipped, eventId });
  } catch (error) {
    return errorResponse(error);
  }
});

function isServerCaller(req: Request) {
  const adminSecret = env('OLW_PUSH_ADMIN_SECRET') || env('OLW_BILLING_ADMIN_SECRET');
  if (adminSecret && req.headers.get('x-olw-admin-secret') === adminSecret) return true;
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  return Boolean(serviceRoleKey && bearerToken(req) === serviceRoleKey);
}

function normalizeEvent(raw: Record<string, unknown>) {
  const category = String(raw.category || '').trim();
  if (!CATEGORY_DEFAULTS[category]) throw new HttpError(400, 'Unsupported notification category.');
  const familyId = String(raw.familyId || raw.family_id || '').trim();
  if (!familyId) throw new HttpError(400, 'Family is required.');

  const metadata = isRecord(raw.metadata) ? raw.metadata : {};
  const defaultRoute = CATEGORY_DEFAULTS[category].route;
  return {
    familyId,
    category,
    actorUserId: String(raw.actorUserId || raw.actor_user_id || '').trim() || null,
    kind: String(raw.kind || metadata.kind || '').trim(),
    route: normalizeRoute(raw.route || raw.deep_link || defaultRoute, defaultRoute),
    title: String(raw.title || '').trim() || defaultTitle(category),
    body: String(raw.body || '').trim() || defaultBody(category),
    eventKey: String(raw.eventKey || raw.event_key || '').trim() || null,
    metadata,
  };
}

async function recordEvent(event: ReturnType<typeof normalizeEvent>) {
  try {
    const rows = await restInsert('notification_events', {
      family_id: event.familyId,
      category: event.category,
      actor_user_id: event.actorUserId,
      title: event.title,
      body: event.body,
      deep_link: event.route,
      event_key: event.eventKey,
      metadata: { ...event.metadata, kind: event.kind },
    }, event.eventKey ? { onConflict: 'event_key', merge: true } : {});
    return Array.isArray(rows) ? rows[0]?.id || null : null;
  } catch (err) {
    if (!isMissingNotificationTable(err)) throw err;
    return null;
  }
}

async function recipientsForEvent(event: ReturnType<typeof normalizeEvent>) {
  const rows = await restSelect(
    'family_members',
    `family_id=eq.${encodeURIComponent(event.familyId)}&select=user_id,display_name,role`,
  );
  const members = Array.isArray(rows) ? rows : [];
  return members.filter((member) => ['creator', 'partner'].includes(String(member.role || '')));
}

async function preferenceRows(familyId: string, userIds: string[]) {
  if (!userIds.length) return [];
  try {
    const rows = await restSelect(
      'notification_preferences',
      [
        'select=user_id,category,enabled,quiet_start,quiet_end',
        `family_id=eq.${encodeURIComponent(familyId)}`,
        `user_id=in.(${userIds.map(encodeURIComponent).join(',')})`,
      ].join('&'),
    );
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    if (!isMissingNotificationTable(err)) throw err;
    return [];
  }
}

async function deliveryDecision({
  event,
  recipientUserId,
  preferences,
  today,
  timeZone,
}: {
  event: ReturnType<typeof normalizeEvent>;
  recipientUserId: string;
  preferences: Array<Record<string, unknown>>;
  today: string;
  timeZone: string | null;
}) {
  const deliveries = await deliveryRows({ familyId: event.familyId, recipientUserId, today });
  return deliveryDecisionFromRows({ event, recipientUserId, preferences, deliveries, today, timeZone });
}

// family_ritual_settings.timezone holds an IANA zone once the client has
// stamped it; the legacy default 'local' means "unknown" and falls back to UTC.
async function familyTimeZone(familyId: string) {
  try {
    const rows = await restSelect(
      'family_ritual_settings',
      `family_id=eq.${encodeURIComponent(familyId)}&select=timezone`,
    );
    const value = String((Array.isArray(rows) ? rows[0]?.timezone : '') || '').trim();
    if (!value || value === 'local') return null;
    return value;
  } catch {
    return null;
  }
}

async function deliveryRows({
  familyId,
  recipientUserId,
  today,
}: {
  familyId: string;
  recipientUserId: string;
  today: string;
}) {
  try {
    const rows = await restSelect(
      'notification_deliveries',
      [
        'select=category,batch_key',
        `family_id=eq.${encodeURIComponent(familyId)}`,
        `user_id=eq.${encodeURIComponent(recipientUserId)}`,
        `delivery_day=eq.${encodeURIComponent(today)}`,
      ].join('&'),
    );
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    if (!isMissingNotificationTable(err)) throw err;
    return [];
  }
}

async function sendPush({
  familyId,
  userId,
  category,
  route,
  title,
  body,
  eventId,
}: {
  familyId: string;
  userId: string;
  category: string;
  route: string;
  title: string;
  body: string;
  eventId: string | null;
}) {
  const supabaseUrl = env('SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) throw new HttpError(500, 'Supabase service role is not configured.');

  const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      familyId,
      userIds: [userId],
      category,
      route,
      title,
      body,
      data: { category, route, eventId },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status, payload?.error || 'Could not send push.');
  return Number(payload?.sent || 0);
}

async function recordDelivery({
  event,
  recipientUserId,
  batchKey,
  deliveryDay,
  title,
  body,
}: {
  event: ReturnType<typeof normalizeEvent>;
  recipientUserId: string;
  batchKey: string;
  deliveryDay: string;
  title: string;
  body: string;
}) {
  try {
    await restInsert('notification_deliveries', {
      family_id: event.familyId,
      user_id: recipientUserId,
      category: event.category,
      delivery_day: deliveryDay,
      batch_key: batchKey,
      event_count: 1,
      title,
      body,
      deep_link: event.route,
    }, { onConflict: 'user_id,family_id,batch_key', merge: true });
  } catch (err) {
    if (!isMissingNotificationTable(err)) throw err;
  }
}

async function markEventProcessed(eventId: string) {
  await supabaseRequest(`/rest/v1/notification_events?id=eq.${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ processed_at: new Date().toISOString() }),
  });
}

function copyForEvent(event: ReturnType<typeof normalizeEvent>, actorName: string) {
  if (event.category !== 'partner_activity') return { title: event.title, body: event.body };
  if (event.kind === 'prompt_response') {
    return { title: `${actorName} answered today's prompt`, body: "Open today's prompt." };
  }
  if (event.kind === 'first_saved') {
    return { title: `${actorName} saved a First`, body: event.body };
  }
  if (event.kind === 'letter_sealed') {
    return { title: `${actorName} sealed a letter`, body: 'Open Letters.' };
  }
  return { title: event.title, body: event.body };
}

function displayName(row: Record<string, unknown> | undefined) {
  return String(row?.display_name || '').trim();
}

function normalizeRoute(value: unknown, fallback: string) {
  const route = String(value || fallback).trim();
  return route.startsWith('/') ? route : fallback;
}

function defaultTitle(category: string) {
  if (category === 'weekly_digest') return "Next week's story is ready";
  if (category === 'daily_prompt') return "Today's prompt is ready";
  if (category === 'new_moments') return 'New moments found';
  if (category === 'suggested_firsts') return 'Worth a look';
  if (category === 'tonight_picks') return "Tonight's picks are ready";
  if (category === 'letter_openable') return 'A letter is ready to open';
  if (category === 'circle_joined') return 'Someone joined the family circle';
  return 'Our Little World';
}

function defaultBody(category: string) {
  if (category === 'weekly_digest') return 'Open the weekly digest.';
  if (category === 'daily_prompt') return 'A few lines are enough.';
  if (category === 'new_moments') return 'Take a look when you have a minute.';
  if (category === 'suggested_firsts') return 'Possible-first photos are ready to review.';
  if (category === 'tonight_picks') return "Tonight's picks are ready.";
  if (category === 'letter_openable') return 'Open Letters.';
  if (category === 'circle_joined') return 'Open the family circle.';
  return 'Open Our Little World.';
}

function isMissingNotificationTable(error: unknown) {
  const err = error as { code?: string; message?: string };
  return err?.code === '42P01'
    || err?.code === 'PGRST205'
    || String(err?.message || '').includes('notification_');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

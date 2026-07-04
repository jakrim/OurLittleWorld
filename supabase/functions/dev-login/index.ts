const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const enabled = Deno.env.get('DEV_LOGIN_ENABLED') === 'true';
  const expectedCode = Deno.env.get('DEV_LOGIN_CODE') || '';
  const expectedEmail = normalizeEmail(Deno.env.get('DEV_LOGIN_EMAIL') || '');
  const allowedIps = parseCsv(Deno.env.get('DEV_LOGIN_ALLOWED_IPS') || '');
  const allowAnyIp = Deno.env.get('DEV_LOGIN_ALLOW_ANY_IP') === 'true';

  if (!enabled) return json({ error: 'Dev login is not enabled.' }, 404);
  if (!expectedCode || !expectedEmail) return json({ error: 'Dev login is not configured.' }, 500);
  if (!/^\d{6}$/.test(expectedCode)) {
    return json({ error: 'Dev login code must be exactly 6 digits.' }, 500);
  }
  if (allowedIps.length === 0 && !allowAnyIp) {
    return json({ error: 'Dev login IP allowlist is not configured.' }, 500);
  }

  const clientIp = getClientIp(req);
  if (!allowAnyIp && !ipAllowed(clientIp, allowedIps)) {
    return json({ error: 'Dev login is not allowed from this IP.' }, 403);
  }

  let body: { email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  if (normalizeEmail(body.email || '') !== expectedEmail || String(body.code || '') !== expectedCode) {
    return json({ error: 'Invalid dev code.' }, 403);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Supabase service credentials are not configured.' }, 500);
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email: expectedEmail }),
  });

  if (!authResponse.ok) {
    return json({ error: 'Could not create dev login token.' }, 502);
  }

  const payload = await authResponse.json();
  const properties = payload?.properties || payload?.data?.properties || payload;
  const tokenHash = properties?.hashed_token || tokenHashFromActionLink(properties?.action_link);
  if (!tokenHash) return json({ error: 'Dev login token was missing.' }, 502);

  return json({ email: expectedEmail, tokenHash });
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json',
    },
  });
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function parseCsv(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function tokenHashFromActionLink(actionLink?: string) {
  if (!actionLink) return null;
  try {
    return new URL(actionLink).searchParams.get('token');
  } catch {
    return null;
  }
}

function getClientIp(req: Request) {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return normalizeIp(
    forwardedFor ||
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      '',
  );
}

function normalizeIp(ip: string) {
  const value = ip.trim();
  return value.startsWith('::ffff:') ? value.slice(7) : value;
}

function ipAllowed(ip: string, allowedIps: string[]) {
  if (!ip) return false;
  return allowedIps.some((entry) => {
    if (entry.includes('/')) return ipv4CidrContains(ip, entry);
    return normalizeIp(entry) === ip;
  });
}

function ipv4CidrContains(ip: string, cidr: string) {
  const [range, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const ipNum = ipv4ToNumber(ip);
  const rangeNum = ipv4ToNumber(range);
  if (ipNum == null || rangeNum == null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }

  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

function ipv4ToNumber(ip: string) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let out = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const value = Number(part);
    if (value < 0 || value > 255) return null;
    out = ((out << 8) | value) >>> 0;
  }
  return out;
}

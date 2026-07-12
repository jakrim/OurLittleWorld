const EVENT_SPECS = Object.freeze({
  onboarding_started: {
    required: ['surface', 'entry_type'],
    values: { surface: ['setup'], entry_type: ['fresh_install', 'signed_out', 'invite_link', 'gift_link', 'unknown'] },
  },
  photo_permission_granted: {
    required: ['surface', 'permission_scope'],
    values: { surface: ['setup', 'settings'], permission_scope: ['limited', 'full', 'add_only', 'unknown'] },
  },
  moment_saved: {
    required: ['surface', 'save_source', 'media_kind', 'media_count_bucket', 'has_voice', 'has_text_note'],
    values: {
      surface: ['add', 'review'],
      save_source: ['add_sheet', 'review_batch', 'auto_save', 'moment_edit'],
      media_kind: ['none', 'photo', 'video', 'photo_video', 'voice', 'mixed', 'unknown'],
      media_count_bucket: ['0', '1', '2_4', '5_9', '10_24', '25_plus'],
    },
  },
  purchase_started: {
    required: ['surface', 'purchase_source', 'product_key', 'purchase_channel'],
    values: {
      surface: ['purchase', 'settings'],
      purchase_source: ['paywall', 'pricing', 'gift', 'settings', 'book_export'],
      product_key: ['family_month', 'family_year', 'vault_month', 'vault_year', 'gift_year', 'gift_vault_year', 'unknown'],
      purchase_channel: ['in_app', 'web_checkout', 'partner', 'unknown'],
    },
  },
  purchase_completed: {
    required: ['surface', 'product_key', 'purchase_channel', 'plan_state_after'],
    values: {
      surface: ['purchase', 'settings'],
      product_key: ['family_month', 'family_year', 'vault_month', 'vault_year', 'gift_year', 'gift_vault_year', 'unknown'],
      purchase_channel: ['in_app', 'web_checkout', 'partner', 'unknown'],
      plan_state_after: ['trialing', 'active', 'gift', 'unknown'],
    },
  },
  gift_started: {
    required: ['surface', 'gift_source', 'gift_product_key'],
    values: {
      surface: ['purchase', 'settings'],
      gift_source: ['web_gift', 'web_pricing', 'app_purchase', 'settings', 'partner'],
      gift_product_key: ['gift_year', 'gift_vault_year', 'partner_package', 'unknown'],
    },
  },
  gift_redeemed: {
    required: ['surface', 'redemption_type', 'plan_state_after'],
    values: {
      surface: ['purchase', 'settings'],
      redemption_type: ['gift', 'website', 'partner'],
      plan_state_after: ['gift', 'active', 'unknown'],
    },
  },
});

const COMMON_PROPERTIES = new Set([
  'source',
  'environment',
  'platform',
  'app_version',
  'family_id',
  'actor_role',
  'plan_state',
  'campaign',
  'angle',
  'creative',
  'channel',
  'landing_page',
]);

const FORBIDDEN_KEYS = new Set([
  'name', 'babyname', 'childname', 'displayname', 'birthday', 'title', 'caption',
  'body', 'note', 'text', 'description', 'summary', 'prompttext', 'prompt_text',
  'responsetext', 'response_text', 'letterbody', 'letter_body', 'transcript',
  'voicetranscript', 'mediaurl', 'media_url', 'fullurl', 'thumburl', 'uri',
  'localuri', 'assetid', 'localidentifier', 'photoidentifier', 'latitude',
  'longitude', 'address', 'locationlabel', 'placename', 'email', 'phone',
  'invitecode', 'redemptioncode', 'checkoutsessionid',
].map(normalizeKey));

const SAFE_STRING_PATTERNS = [
  /https?:\/\//i,
  /file:\/\//i,
  /content:\/\//i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\/Users\/|\/var\/mobile\//i,
];

const DEFAULT_CONTEXT = Object.freeze({
  source: 'mobile',
  environment: 'development',
  platform: 'unknown',
  app_version: null,
  family_id: null,
  actor_role: 'unknown',
  plan_state: 'unknown',
});

export function buildAnalyticsEvent(eventName, properties = {}, context = {}) {
  const spec = EVENT_SPECS[eventName];
  if (!spec) throw new Error(`Unknown analytics event: ${eventName || '(empty)'}`);
  assertPlainObject(properties, 'properties');
  assertPlainObject(context, 'context');
  assertSafePayload(properties);
  assertSafePayload(context);

  const allowed = new Set([...COMMON_PROPERTIES, ...spec.required]);
  const input = { ...context, ...properties };
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`Unknown analytics property: ${key}`);
  }
  for (const key of spec.required) {
    if (input[key] === undefined || input[key] === null) throw new Error(`Missing analytics property: ${key}`);
  }
  for (const [key, values] of Object.entries(spec.values || {})) {
    if (input[key] !== undefined && !values.includes(input[key])) {
      throw new Error(`Invalid analytics value for ${key}`);
    }
  }

  return {
    event_name: eventName,
    schema_version: 1,
    ...DEFAULT_CONTEXT,
    ...context,
    ...properties,
  };
}

export function bucketCount(value) {
  const count = Math.max(0, Number(value) || 0);
  if (count === 0) return '0';
  if (count === 1) return '1';
  if (count <= 4) return '2_4';
  if (count <= 9) return '5_9';
  if (count <= 24) return '10_24';
  return '25_plus';
}

function assertSafePayload(value, path = 'payload') {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(normalizeKey(key))) throw new Error(`Forbidden analytics field: ${key}`);
    if (nested && typeof nested === 'object') assertSafePayload(nested, `${path}.${key}`);
    if (typeof nested === 'string' && SAFE_STRING_PATTERNS.some((pattern) => pattern.test(nested))) {
      throw new Error(`Unsafe analytics value at ${path}.${key}`);
    }
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Analytics ${label} must be an object`);
  }
}

function normalizeKey(value) {
  return String(value).replace(/[^a-z0-9]/gi, '').toLowerCase();
}

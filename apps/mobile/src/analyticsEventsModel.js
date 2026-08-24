export const ANALYTICS_SCHEMA_VERSION = 1;

export const ANALYTICS_EVENT_NAMES = Object.freeze([
  'onboarding_started',
  'child_profile_created',
  'reference_photo_confirmed',
  'photo_permission_granted',
  'assistant_review_opened',
  'assistant_suggestion_kept',
  'assistant_suggestion_dismissed',
  'review_batch_saved',
  'auto_save_enabled',
  'auto_save_disabled',
  'auto_saved_moment_removed',
  'moment_saved',
  'post_save_nudge_shown',
  'post_save_nudge_accepted',
  'prompt_answered',
  'missed_prompt_answered',
  'first_saved',
  'letter_saved',
  'digest_opened',
  'book_opened',
  'book_export_started',
  'invite_sent',
  'gift_started',
  'gift_redeemed',
  'paywall_eligible',
  'first_value_started',
  'first_value_completed',
  'paywall_viewed',
  'plan_selected',
  'checkout_started',
  'trial_started',
  'purchase_verified',
  'purchase_failed',
  'purchase_restored',
  'paywall_dismissed',
  'purchase_started',
  'purchase_completed',
  'tonight_opened',
  'tonight_item_decided',
  'tonight_completed',
  'tonight_notification_scheduled',
  'collection_correction_applied',
  'shared_annotation_saved',
]);

export const ANALYTICS_FORBIDDEN_KEYS = Object.freeze([
  'name',
  'babyName',
  'childName',
  'displayName',
  'title',
  'caption',
  'body',
  'note',
  'text',
  'description',
  'summary',
  'promptText',
  'prompt_text',
  'responseText',
  'response_text',
  'letterBody',
  'letter_body',
  'transcript',
  'voiceTranscript',
  'draftVoiceUri',
  'voicePath',
  'reactionCode',
  'retryId',
  'mediaUrl',
  'media_url',
  'fullUrl',
  'thumbUrl',
  'uri',
  'localUri',
  'assetId',
  'localIdentifier',
  'photoIdentifier',
  'latitude',
  'longitude',
  'address',
  'locationLabel',
  'placeName',
  'email',
  'phone',
  'inviteCode',
  'redemptionCode',
  'checkoutSessionId',
]);

const ENUMS = Object.freeze({
  source: ['mobile', 'web', 'supabase_edge'],
  environment: ['development', 'preview', 'production'],
  platform: ['ios', 'android', 'web', 'unknown'],
  actor_role: ['creator', 'partner', 'circle', 'gift_recipient', 'unknown'],
  plan_state: ['none', 'trialing', 'active', 'gift', 'lapsed', 'past_due', 'unknown'],
  surface: [
    'welcome',
    'setup',
    'today',
    'add',
    'review',
    'book',
    'moment_detail',
    'firsts',
    'letters',
    'digest',
    'settings',
    'purchase',
    'first_value_preview',
    'gift',
    'web_pricing',
    'web_gift',
    'notification',
    'tonight',
    'our_world',
    'collections',
    'unknown',
  ],
  child_age_band: ['prenatal', '0_3m', '3_6m', '6_12m', '12_24m', '24m_plus', 'unknown'],
  count_bucket: ['0', '1', '2_4', '5_9', '10_24', '25_plus'],
  assistant_trust_state: [
    'review_required',
    'learning',
    'auto_save_ready',
    'auto_save_active',
    'needs_correction_review',
  ],
  media_kind: ['none', 'photo', 'video', 'photo_video', 'voice', 'mixed', 'unknown'],
});

const SUBSCRIPTION_FUNNEL_PROPERTIES = Object.freeze([
  'paywall_source',
  'paywall_version',
  'offer_version',
  'product',
  'entitlement',
  'product_id',
  'duration',
  'storefront_bucket',
  'localized_amount',
  'currency',
  'trial_eligibility',
  'experiment',
  'cohort',
  'product_load_success',
  'verified_entitlement_outcome',
  'preview_state',
  'media_kind',
  'failure_stage',
]);

const SUBSCRIPTION_FUNNEL_VALUES = Object.freeze({
  paywall_source: ['first_value_preview', 'settings', 'book_export', 'feature_gate', 'restore', 'unknown'],
  product: ['family'],
  entitlement: ['family'],
  duration: ['monthly', 'annual', 'unknown'],
  storefront_bucket: ['us', 'non_us', 'unknown'],
  trial_eligibility: ['eligible', 'ineligible', 'not_applicable', 'unknown'],
  verified_entitlement_outcome: ['not_checked', 'granted', 'denied', 'unknown'],
  preview_state: ['found', 'approved'],
  failure_stage: ['product_load', 'checkout', 'verification', 'restore', 'unknown'],
});

function subscriptionFunnelSpec(required, values = {}) {
  return {
    required,
    properties: SUBSCRIPTION_FUNNEL_PROPERTIES,
    values: { ...SUBSCRIPTION_FUNNEL_VALUES, ...values },
  };
}

const EVENT_SPECS = Object.freeze({
  onboarding_started: {
    required: ['surface', 'entry_type'],
    values: { entry_type: ['fresh_install', 'signed_out', 'invite_link', 'gift_link', 'unknown'] },
  },
  child_profile_created: {
    required: ['surface', 'child_age_band', 'has_birthday'],
  },
  reference_photo_confirmed: {
    required: ['surface', 'reference_method', 'reference_count_bucket', 'child_age_band'],
    values: {
      reference_method: ['manual_upload', 'auto_seed_confirm', 'auto_seed_fallback'],
      reference_count_bucket: ENUMS.count_bucket,
    },
  },
  photo_permission_granted: {
    required: ['surface', 'permission_scope'],
    values: { permission_scope: ['limited', 'full', 'add_only', 'unknown'] },
  },
  assistant_review_opened: {
    required: ['surface', 'open_source', 'pending_count_bucket', 'assistant_trust_state'],
    values: {
      open_source: ['today_nudge', 'scan_complete', 'book_panel', 'manual_nav', 'notification', 'unknown'],
      pending_count_bucket: ENUMS.count_bucket,
    },
  },
  assistant_suggestion_kept: {
    required: ['surface', 'suggestion_type', 'assistant_trust_state'],
    values: { suggestion_type: ['photo_match', 'photo_stack', 'possible_first', 'post_save_nudge'] },
  },
  assistant_suggestion_dismissed: {
    required: ['surface', 'suggestion_type', 'dismissal_type', 'assistant_trust_state'],
    values: {
      suggestion_type: ['photo_match', 'photo_stack', 'possible_first', 'post_save_nudge'],
      dismissal_type: ['skip', 'not_this', 'not_now', 'close', 'snooze'],
    },
  },
  review_batch_saved: {
    required: [
      'surface',
      'selected_count_bucket',
      'skipped_count_bucket',
      'stack_count_bucket',
      'assistant_trust_state',
    ],
    values: {
      selected_count_bucket: ENUMS.count_bucket,
      skipped_count_bucket: ENUMS.count_bucket,
      stack_count_bucket: ENUMS.count_bucket,
    },
  },
  auto_save_enabled: {
    required: ['surface', 'enable_reason', 'assistant_trust_state'],
    values: { enable_reason: ['clean_review', 'manual_setting', 'policy'] },
  },
  auto_save_disabled: {
    required: ['surface', 'disable_reason', 'assistant_trust_state'],
    values: { disable_reason: ['correction', 'save_error', 'manual_setting', 'missing_reference', 'policy'] },
  },
  auto_saved_moment_removed: {
    required: ['surface', 'removal_surface', 'media_kind'],
    values: { removal_surface: ['today', 'book', 'timeline', 'moment_detail'] },
  },
  moment_saved: {
    required: [
      'surface',
      'save_source',
      'media_kind',
      'media_count_bucket',
      'has_voice',
      'has_text_note',
      'happened_at_changed',
      'child_age_band',
    ],
    values: {
      save_source: ['add_sheet', 'review_batch', 'auto_save', 'moment_edit'],
      media_count_bucket: ENUMS.count_bucket,
    },
  },
  post_save_nudge_shown: {
    required: ['surface', 'nudge_type', 'source_save_type'],
    values: {
      nudge_type: ['first', 'voice', 'letter', 'book_ready'],
      source_save_type: ['manual', 'review', 'auto_save'],
    },
  },
  post_save_nudge_accepted: {
    required: ['surface', 'nudge_type', 'destination'],
    values: {
      nudge_type: ['first', 'voice', 'letter', 'book_ready'],
      destination: ['first_compose', 'letter_compose', 'voice_note', 'moment_edit', 'book'],
    },
  },
  prompt_answered: {
    required: ['surface', 'prompt_key', 'prompt_age_band', 'has_linked_moment'],
    values: { prompt_age_band: ENUMS.child_age_band },
  },
  missed_prompt_answered: {
    required: ['surface', 'prompt_key', 'prompt_age_band', 'missed_days_bucket', 'has_linked_moment'],
    values: {
      prompt_age_band: ENUMS.child_age_band,
      missed_days_bucket: ['1', '2_6', '7_30', '30_plus'],
    },
  },
  first_saved: {
    required: ['surface', 'goal_key', 'first_source', 'has_media', 'child_age_band'],
    values: {
      first_source: ['manual', 'suggested_first', 'moment_chip', 'post_save_nudge', 'book_card'],
    },
  },
  letter_saved: {
    required: ['surface', 'letter_source', 'open_state', 'has_source_moment', 'has_source_first'],
    values: {
      letter_source: ['manual', 'moment_chip', 'first_source', 'digest', 'book_card', 'post_save_nudge'],
      open_state: ['open', 'sealed'],
    },
  },
  digest_opened: {
    required: ['surface', 'open_source', 'digest_age_days_bucket', 'moment_count_bucket'],
    values: {
      open_source: ['today', 'book', 'notification', 'manual_nav'],
      digest_age_days_bucket: ['0_1', '2_6', '7_30', '30_plus'],
      moment_count_bucket: ENUMS.count_bucket,
    },
  },
  book_opened: {
    required: ['surface', 'open_source', 'book_state', 'chapter_count_bucket', 'moment_count_bucket'],
    values: {
      open_source: ['bottom_nav', 'today_nudge', 'post_save_nudge', 'settings', 'notification'],
      book_state: ['empty', 'building', 'print_ready'],
      chapter_count_bucket: ENUMS.count_bucket,
      moment_count_bucket: ENUMS.count_bucket,
    },
  },
  book_export_started: {
    required: ['surface', 'export_format', 'book_state', 'chapter_count_bucket', 'moment_count_bucket'],
    values: {
      export_format: ['html', 'pdf', 'print_preview', 'unknown'],
      book_state: ['empty', 'building', 'print_ready'],
      chapter_count_bucket: ENUMS.count_bucket,
      moment_count_bucket: ENUMS.count_bucket,
    },
  },
  invite_sent: {
    required: ['surface', 'invite_role', 'send_method'],
    values: {
      invite_role: ['partner', 'circle'],
      send_method: ['share_sheet', 'copy_code', 'email', 'sms', 'unknown'],
    },
  },
  gift_started: {
    required: ['surface', 'gift_source', 'gift_product_key'],
    values: {
      gift_source: ['web_gift', 'web_pricing', 'app_purchase', 'settings', 'partner'],
      gift_product_key: ['gift_year', 'gift_vault_year', 'partner_package', 'unknown'],
    },
  },
  gift_redeemed: {
    required: ['surface', 'redemption_type', 'plan_state_after'],
    values: {
      redemption_type: ['gift', 'website', 'partner'],
      plan_state_after: ['gift', 'active', 'unknown'],
    },
  },
  paywall_eligible: subscriptionFunnelSpec([
    'surface', 'paywall_source', 'paywall_version', 'offer_version', 'preview_state', 'media_kind',
  ]),
  first_value_started: subscriptionFunnelSpec([
    'surface', 'paywall_source', 'paywall_version', 'offer_version',
  ]),
  first_value_completed: subscriptionFunnelSpec([
    'surface', 'paywall_source', 'paywall_version', 'offer_version', 'preview_state', 'media_kind',
  ]),
  paywall_viewed: subscriptionFunnelSpec([
    'surface', 'paywall_source', 'paywall_version', 'offer_version', 'product_load_success',
  ]),
  plan_selected: subscriptionFunnelSpec([
    'surface', 'paywall_source', 'paywall_version', 'offer_version', 'product', 'entitlement',
    'product_id', 'duration', 'storefront_bucket', 'localized_amount', 'currency',
    'trial_eligibility', 'experiment', 'cohort', 'product_load_success',
  ]),
  checkout_started: subscriptionFunnelSpec([
    'surface', 'paywall_source', 'paywall_version', 'offer_version', 'product', 'entitlement',
    'product_id', 'duration', 'storefront_bucket', 'localized_amount', 'currency',
    'trial_eligibility', 'experiment', 'cohort', 'product_load_success',
  ]),
  trial_started: subscriptionFunnelSpec([
    'surface', 'paywall_source', 'paywall_version', 'offer_version', 'product', 'entitlement',
    'product_id', 'duration', 'storefront_bucket', 'localized_amount', 'currency',
    'trial_eligibility', 'experiment', 'cohort', 'verified_entitlement_outcome',
  ]),
  purchase_verified: subscriptionFunnelSpec([
    'surface', 'paywall_source', 'paywall_version', 'offer_version', 'product', 'entitlement',
    'product_id', 'duration', 'storefront_bucket', 'localized_amount', 'currency',
    'trial_eligibility', 'experiment', 'cohort', 'verified_entitlement_outcome',
  ]),
  purchase_failed: subscriptionFunnelSpec([
    'surface', 'paywall_source', 'paywall_version', 'offer_version', 'product_id',
    'duration', 'failure_stage', 'verified_entitlement_outcome',
  ]),
  purchase_restored: subscriptionFunnelSpec([
    'surface', 'paywall_source', 'paywall_version', 'offer_version', 'product', 'entitlement',
    'product_id', 'duration', 'storefront_bucket', 'localized_amount', 'currency',
    'trial_eligibility', 'experiment', 'cohort', 'verified_entitlement_outcome',
  ]),
  paywall_dismissed: subscriptionFunnelSpec([
    'surface', 'paywall_source', 'paywall_version', 'offer_version',
  ]),
  purchase_started: {
    required: ['surface', 'purchase_source', 'product_key', 'purchase_channel'],
    values: {
      purchase_source: ['paywall', 'pricing', 'gift', 'settings', 'book_export'],
      product_key: [
        'family_month',
        'family_year',
        'vault_month',
        'vault_year',
        'gift_year',
        'gift_vault_year',
        'unknown',
      ],
      purchase_channel: ['in_app', 'web_checkout', 'partner', 'unknown'],
    },
  },
  purchase_completed: {
    required: ['surface', 'product_key', 'purchase_channel', 'plan_state_after'],
    values: {
      product_key: [
        'family_month',
        'family_year',
        'vault_month',
        'vault_year',
        'gift_year',
        'gift_vault_year',
        'unknown',
      ],
      purchase_channel: ['in_app', 'web_checkout', 'partner', 'unknown'],
      plan_state_after: ['trialing', 'active', 'gift', 'unknown'],
    },
  },
  tonight_opened: {
    required: ['surface', 'open_source', 'queue_count_bucket', 'resume_state'],
    values: {
      open_source: ['today', 'notification', 'direct', 'unknown'],
      queue_count_bucket: ENUMS.count_bucket,
      resume_state: ['new', 'resumed', 'completed', 'empty'],
    },
  },
  tonight_item_decided: {
    required: ['surface', 'decision', 'media_kind', 'has_enrichment', 'retry_state'],
    values: {
      decision: ['kept', 'skipped', 'unavailable'],
      retry_state: ['first_try', 'retry'],
    },
  },
  tonight_completed: {
    required: [
      'surface',
      'kept_count_bucket',
      'skipped_count_bucket',
      'unavailable_count_bucket',
      'enriched_count_bucket',
      'duration_bucket',
      'continuation',
    ],
    values: {
      kept_count_bucket: ENUMS.count_bucket,
      skipped_count_bucket: ENUMS.count_bucket,
      unavailable_count_bucket: ENUMS.count_bucket,
      enriched_count_bucket: ENUMS.count_bucket,
      duration_bucket: ['under_1m', '1_3m', '3_5m', '5_10m', '10m_plus', 'unknown'],
    },
  },
  tonight_notification_scheduled: {
    required: ['surface', 'queue_count_bucket', 'schedule_day'],
    values: {
      queue_count_bucket: ENUMS.count_bucket,
      schedule_day: ['same_local_day', 'next_local_day'],
    },
  },
  collection_correction_applied: {
    required: ['surface', 'correction', 'collection_kind'],
    values: {
      correction: ['excluded', 'restored'],
      collection_kind: ['date', 'media', 'author', 'first', 'place', 'favorite', 'reaction', 'first_year', 'unknown'],
    },
  },
  shared_annotation_saved: {
    required: ['surface', 'annotation_kind'],
    values: { annotation_kind: ['text', 'voice', 'mixed'] },
  },
});

export const ANALYTICS_EVENT_SPECS = EVENT_SPECS;

const COMMON_PROPERTIES = Object.freeze([
  'source',
  'environment',
  'platform',
  'app_version',
  'family_id',
  'child_id',
  'actor_role',
  'plan_state',
  'campaign',
  'angle',
  'creative',
  'channel',
  'landing_page',
]);

const DEFAULT_ENVELOPE = Object.freeze({
  source: 'mobile',
  environment: 'development',
  platform: 'unknown',
  app_version: null,
  family_id: null,
  child_id: null,
  actor_role: 'unknown',
  plan_state: 'unknown',
});

const FORBIDDEN_KEY_LOOKUP = new Set(ANALYTICS_FORBIDDEN_KEYS.map(normalizeKey));
const UNSAFE_STRING_PATTERNS = [
  /https?:\/\//i,
  /file:\/\//i,
  /content:\/\//i,
  /ph:\/\//i,
  /assets-library:\/\//i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+$/,
  /\/Users\/|\/var\/mobile\//i,
];

export function buildAnalyticsEvent(eventName, properties = {}, context = {}) {
  const normalizedEventName = String(eventName || '').trim();
  const spec = EVENT_SPECS[normalizedEventName];
  if (!spec) {
    throw new Error(`Unknown analytics event: ${normalizedEventName || '(empty)'}`);
  }
  assertPlainObject(properties, 'properties');
  assertPlainObject(context, 'context');
  assertNoForbiddenFields(properties);
  assertNoForbiddenFields(context);

  const allowedProperties = new Set([
    ...COMMON_PROPERTIES,
    ...spec.required,
    ...(spec.properties || []),
  ]);
  const input = { ...context, ...properties };
  for (const key of Object.keys(input)) {
    if (!allowedProperties.has(key)) {
      throw new Error(`Unknown analytics property for ${normalizedEventName}: ${key}`);
    }
  }

  const event = {
    event_name: normalizedEventName,
    schema_version: ANALYTICS_SCHEMA_VERSION,
    ...DEFAULT_ENVELOPE,
    ...input,
  };

  for (const key of spec.required) {
    if (event[key] === undefined || event[key] === null || event[key] === '') {
      throw new Error(`Missing analytics property for ${normalizedEventName}: ${key}`);
    }
  }

  for (const [key, value] of Object.entries(event)) {
    validateAnalyticsValue({ key, value, spec, eventName: normalizedEventName });
  }

  return Object.freeze(event);
}

export function bucketCount(value) {
  const count = Math.max(0, Number(value || 0));
  if (count === 0) return '0';
  if (count === 1) return '1';
  if (count <= 4) return '2_4';
  if (count <= 9) return '5_9';
  if (count <= 24) return '10_24';
  return '25_plus';
}

function validateAnalyticsValue({ key, value, spec, eventName }) {
  if (key === 'event_name') return;
  if (key === 'schema_version') {
    if (value !== ANALYTICS_SCHEMA_VERSION) throw new Error('Invalid analytics schema version');
    return;
  }
  if (value == null) return;
  if (Array.isArray(value) || typeof value === 'object') {
    throw new Error(`Analytics property must be a primitive: ${key}`);
  }
  if (typeof value === 'string') assertSafeStringValue(key, value);
  const allowed = allowedValuesFor(key, spec);
  if (allowed && !allowed.includes(value)) {
    throw new Error(`Invalid analytics value for ${eventName}.${key}: ${value}`);
  }
  if (key.startsWith('has_') || key === 'happened_at_changed' || key === 'continuation' || key === 'product_load_success') {
    if (typeof value !== 'boolean') throw new Error(`Analytics property must be boolean: ${key}`);
  }
}

function allowedValuesFor(key, spec) {
  if (spec.values?.[key]) return spec.values[key];
  if (ENUMS[key]) return ENUMS[key];
  if (key.endsWith('_count_bucket')) return ENUMS.count_bucket;
  if (key === 'media_kind') return ENUMS.media_kind;
  if (key === 'assistant_trust_state') return ENUMS.assistant_trust_state;
  if (key === 'child_age_band') return ENUMS.child_age_band;
  return null;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Analytics ${label} must be an object`);
  }
}

function assertNoForbiddenFields(value, path = []) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_LOOKUP.has(normalizeKey(key))) {
      throw new Error(`Forbidden analytics field: ${[...path, key].join('.')}`);
    }
    if (child && typeof child === 'object') {
      assertNoForbiddenFields(child, [...path, key]);
    }
  }
}

function assertSafeStringValue(key, value) {
  for (const pattern of UNSAFE_STRING_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error(`Unsafe analytics value for ${key}`);
    }
  }
}

function normalizeKey(value) {
  return String(value || '').replace(/[_-]/g, '').toLowerCase();
}

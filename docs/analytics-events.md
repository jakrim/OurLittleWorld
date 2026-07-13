# Analytics Events

Status: event-name contract, mobile allowlisted wrapper, consent-aware dedicated
PostHog HTTP transport, and initial onboarding, permission, moment, purchase, gift,
website CTA, and checkout emissions are implemented. Delivery remains disabled
without a dedicated Our Little World project token and a `granted` consent state.

Goal: measure activation, weekly habit, assistant acceptance, Book payoff, gift
intent, and purchase conversion without collecting private memory content.

## Privacy Contract

Analytics payloads may include IDs, counts, coarse state, product keys, roles, and
booleans. They must not include memory content, contact data, exact child profile
facts, URLs, device-library identifiers, or redemption/invite codes.

Forbidden fields, including nested fields and case variants:

- `name`, `babyName`, `childName`, `displayName`
- `title`, `caption`, `body`, `note`, `text`, `description`, `summary`
- `promptText`, `prompt_text`, `responseText`, `response_text`
- `letterBody`, `letter_body`, `transcript`, `voiceTranscript`
- `mediaUrl`, `media_url`, `fullUrl`, `thumbUrl`, `uri`, `localUri`
- `assetId`, `localIdentifier`, `photoIdentifier`
- `latitude`, `longitude`, `address`, `locationLabel`, `placeName`
- `email`, `phone`, `inviteCode`, `redemptionCode`, `checkoutSessionId`

Do not send child names, birthdays, prompt answers, letter text, captions, memory
notes, voice content, media URLs, raw locations, or camera-roll identifiers. If a
future metric needs context, add a coarse enum or bucket here first.

## Common Envelope

Every event must include this envelope once the analytics wrapper exists:

| Property | Type | Allowed values |
| --- | --- | --- |
| `event_name` | string | One event name from this document |
| `schema_version` | integer | `1` |
| `source` | enum | `mobile`, `web`, `supabase_edge` |
| `environment` | enum | `development`, `preview`, `production` |
| `platform` | enum | `ios`, `web`, `unknown` |
| `app_version` | string or null | Version string only |
| `family_id` | uuid or null | Null before a family exists |
| `child_id` | uuid or null | Null until K1 child rows exist |
| `actor_role` | enum | `creator`, `partner`, `circle`, `gift_recipient`, `unknown` |
| `plan_state` | enum | `none`, `trialing`, `active`, `gift`, `lapsed`, `past_due`, `unknown` |

Allowed shared property enums:

- `surface`: `welcome`, `setup`, `today`, `add`, `review`, `book`,
  `moment_detail`, `firsts`, `letters`, `digest`, `settings`, `purchase`,
  `gift`, `web_pricing`, `web_gift`, `notification`, `unknown`
- `child_age_band`: `prenatal`, `0_3m`, `3_6m`, `6_12m`, `12_24m`,
  `24m_plus`, `unknown`
- `count_bucket`: `0`, `1`, `2_4`, `5_9`, `10_24`, `25_plus`
- `assistant_trust_state`: `review_required`, `learning`, `auto_save_ready`,
  `auto_save_active`, `needs_correction_review`
- `media_kind`: `none`, `photo`, `video`, `photo_video`, `voice`, `mixed`,
  `unknown`

## Event Dictionary

| Event | Trigger | Required event properties | Allowed values |
| --- | --- | --- | --- |
| `onboarding_started` | First onboarding/welcome step is opened for a signed-out or newly signed-in user. | `surface`, `entry_type` | `entry_type`: `fresh_install`, `signed_out`, `invite_link`, `gift_link`, `unknown` |
| `child_profile_created` | Setup saves the family child profile. | `surface`, `child_age_band`, `has_birthday` | `has_birthday`: boolean |
| `reference_photo_confirmed` | Parent confirms a reference profile photo or auto-seeded reference candidate. | `surface`, `reference_method`, `reference_count_bucket`, `child_age_band` | `reference_method`: `manual_upload`, `auto_seed_confirm`, `auto_seed_fallback`; `reference_count_bucket`: `count_bucket` |
| `photo_permission_granted` | User grants photo-library access from an app request. | `surface`, `permission_scope` | `permission_scope`: `limited`, `full`, `add_only`, `unknown` |
| `assistant_review_opened` | Review screen opens with assistant candidates. | `surface`, `open_source`, `pending_count_bucket`, `assistant_trust_state` | `open_source`: `today_nudge`, `scan_complete`, `book_panel`, `manual_nav`, `notification`, `unknown` |
| `assistant_suggestion_kept` | Parent keeps an assistant suggestion before saving. | `surface`, `suggestion_type`, `assistant_trust_state` | `suggestion_type`: `photo_match`, `photo_stack`, `possible_first`, `post_save_nudge` |
| `assistant_suggestion_dismissed` | Parent skips, dismisses, or says not-this to an assistant suggestion. | `surface`, `suggestion_type`, `dismissal_type`, `assistant_trust_state` | `dismissal_type`: `skip`, `not_this`, `not_now`, `close`, `snooze` |
| `review_batch_saved` | Parent saves a review batch. | `surface`, `selected_count_bucket`, `skipped_count_bucket`, `stack_count_bucket`, `assistant_trust_state` | Count fields: `count_bucket` |
| `auto_save_enabled` | Calibrated auto-save becomes active for clear matches. | `surface`, `enable_reason`, `assistant_trust_state` | `enable_reason`: `clean_review`, `manual_setting`, `policy` |
| `auto_save_disabled` | Auto-save pauses or is turned off. | `surface`, `disable_reason`, `assistant_trust_state` | `disable_reason`: `correction`, `save_error`, `manual_setting`, `missing_reference`, `policy` |
| `auto_saved_moment_removed` | Parent removes an assistant-added memory from the Book. | `surface`, `removal_surface`, `media_kind` | `removal_surface`: `today`, `book`, `timeline`, `moment_detail`; `media_kind`: shared enum |
| `moment_saved` | A moment is saved from Add, review, or auto-save. | `surface`, `save_source`, `media_kind`, `media_count_bucket`, `has_voice`, `has_text_note`, `happened_at_changed`, `child_age_band` | `save_source`: `add_sheet`, `review_batch`, `auto_save`, `moment_edit`; booleans for `has_voice`, `has_text_note`, `happened_at_changed` |
| `post_save_nudge_shown` | A post-save nudge sheet is displayed. | `surface`, `nudge_type`, `source_save_type` | `nudge_type`: `first`, `voice`, `letter`, `book_ready`; `source_save_type`: `manual`, `review`, `auto_save` |
| `post_save_nudge_accepted` | Parent taps the action on a post-save nudge. | `surface`, `nudge_type`, `destination` | `destination`: `first_compose`, `letter_compose`, `voice_note`, `moment_edit`, `book` |
| `prompt_answered` | Today's prompt response is saved. | `surface`, `prompt_key`, `prompt_age_band`, `has_linked_moment` | `prompt_key`: internal prompt key only, never prompt text; `prompt_age_band`: same values as `child_age_band`; `has_linked_moment`: boolean |
| `missed_prompt_answered` | A non-current prompt is answered from catch-up or history. | `surface`, `prompt_key`, `prompt_age_band`, `missed_days_bucket`, `has_linked_moment` | `missed_days_bucket`: `1`, `2_6`, `7_30`, `30_plus` |
| `first_saved` | A First is saved or marked done. | `surface`, `goal_key`, `first_source`, `has_media`, `child_age_band` | `goal_key`: internal goal key only; `first_source`: `manual`, `suggested_first`, `moment_chip`, `post_save_nudge`, `book_card`; `has_media`: boolean |
| `letter_saved` | A letter is saved. | `surface`, `letter_source`, `open_state`, `has_source_moment`, `has_source_first` | `letter_source`: `manual`, `moment_chip`, `first_source`, `digest`, `book_card`, `post_save_nudge`; `open_state`: `open`, `sealed`; source fields: boolean |
| `digest_opened` | Weekly digest detail opens. | `surface`, `open_source`, `digest_age_days_bucket`, `moment_count_bucket` | `open_source`: `today`, `book`, `notification`, `manual_nav`; `digest_age_days_bucket`: `0_1`, `2_6`, `7_30`, `30_plus`; count uses `count_bucket` |
| `book_opened` | Book tab/screen opens. | `surface`, `open_source`, `book_state`, `chapter_count_bucket`, `moment_count_bucket` | `open_source`: `bottom_nav`, `today_nudge`, `post_save_nudge`, `settings`, `notification`; `book_state`: `empty`, `building`, `print_ready` |
| `book_export_started` | Parent starts a local Book export/preview. | `surface`, `export_format`, `book_state`, `chapter_count_bucket`, `moment_count_bucket` | `export_format`: `html`, `pdf`, `print_preview`, `unknown`; count fields use `count_bucket` |
| `invite_sent` | Parent sends or copies an invite. | `surface`, `invite_role`, `send_method` | `invite_role`: `partner`, `circle`; `send_method`: `share_sheet`, `copy_code`, `email`, `sms`, `unknown` |
| `gift_started` | Gift purchase or redemption flow starts. | `surface`, `gift_source`, `gift_product_key` | `gift_source`: `web_gift`, `web_pricing`, `app_purchase`, `settings`, `partner`; `gift_product_key`: `gift_year`, `gift_vault_year`, `partner_package`, `unknown` |
| `gift_redeemed` | Gift, website, or partner code redemption succeeds. | `surface`, `redemption_type`, `plan_state_after` | `redemption_type`: `gift`, `website`, `partner`; `plan_state_after`: `gift`, `active`, `unknown` |
| `purchase_started` | User starts checkout or in-app purchase. | `surface`, `purchase_source`, `product_key`, `purchase_channel` | `purchase_source`: `paywall`, `pricing`, `gift`, `settings`, `book_export`; `product_key`: `family_month`, `family_year`, `vault_month`, `vault_year`, `gift_year`, `gift_vault_year`, `unknown`; `purchase_channel`: `in_app`, `web_checkout`, `partner`, `unknown` |
| `purchase_completed` | Checkout or purchase completes successfully. | `surface`, `product_key`, `purchase_channel`, `plan_state_after` | `plan_state_after`: `trialing`, `active`, `gift`, `unknown`; other enums as above |

## J2 Wrapper Requirements

The central analytics wrapper must:

- Reject event names not listed here.
- Reject properties outside the common envelope plus that event's documented
  properties.
- Reject forbidden fields exactly, case-insensitively, and when nested.
- Reject values that look like URLs, emails, phone numbers, raw lat/lon pairs, local
  file paths, prompt answers, letter bodies, captions, transcripts, or invite/gift
  codes.
- Bucket numeric counts before sending unless the event explicitly allows an integer
  count in a future revision.
- Treat `child_id` as optional until K1 backfills child rows.

## Provider and isolation contract

- Mobile transport: `apps/mobile/src/posthogAnalyticsTransport.js`.
- Website transport: `apps/web/lib/marketingAnalytics.ts`.
- Tokens must use the `OUR_LITTLE_WORLD_ANALYTICS_` operational namespace and a
  dedicated PostHog project. Never reuse Get Mentors or LiveVault tokens.
- Person profiles are disabled (`$process_person_profile: false`).
- Consent defaults to `unknown`, which blocks delivery.
- Website acquisition tracking reads only UTM parameters and allowlisted product,
  path, surface, and target enums. It never reads conversion-form payloads.
- First-touch attribution is stored locally; last-touch attribution is stored for
  the browser session. Neither store contains contact or family content.

## Implemented funnel seams

- `onboarding_started` when first setup opens.
- `child_profile_created` after the profile is saved, using only a coarse age band.
- `photo_permission_granted` with coarse permission scope.
- `moment_saved` after a real save, using media type/count buckets and booleans.
- `purchase_started` before opening native billing.
- `purchase_completed` only after server verification and transaction finish.
- `gift_started` before code redemption and `gift_redeemed` after success; the code
  itself never enters analytics.
- Website landing/CTA, checkout-start, gift-start, checkout-complete, and
  gift-complete events. Success-page beacons never read claim or redemption codes.

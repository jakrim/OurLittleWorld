-- Y1: register the `suggested_firsts` notification category.
-- Suggested-firsts nudges are delivered as a LOCAL notification on the
-- generating device (suggestions are device-local state). This category is
-- added to the shared check constraints and cadence defaults for forward
-- compatibility and so the preference toggle round-trips through the same
-- notification_preferences rows as every other category.

alter table public.notification_preferences
  drop constraint if exists notification_preferences_category_check;
alter table public.notification_preferences
  add constraint notification_preferences_category_check
  check (category in (
    'weekly_digest',
    'daily_prompt',
    'partner_activity',
    'new_moments',
    'suggested_firsts',
    'tonight_picks',
    'letter_openable',
    'circle_joined'
  ));

alter table public.notification_events
  drop constraint if exists notification_events_category_check;
alter table public.notification_events
  add constraint notification_events_category_check
  check (category in (
    'weekly_digest',
    'daily_prompt',
    'partner_activity',
    'new_moments',
    'suggested_firsts',
    'tonight_picks',
    'letter_openable',
    'circle_joined',
    'billing_quota'
  ));

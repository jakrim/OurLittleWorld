-- Y1: register the `suggested_firsts` notification category.
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
  ));;

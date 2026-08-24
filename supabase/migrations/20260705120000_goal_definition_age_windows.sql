-- Machine-readable age windows for goal definitions (A1).
-- Windows are intentionally generous starting points (tunable), derived from target_age_label.

alter table public.goal_definitions
  add column if not exists target_age_min_days integer,
  add column if not exists target_age_max_days integer;

update public.goal_definitions set target_age_min_days = 42,  target_age_max_days = 70  where key = 'smile';
update public.goal_definitions set target_age_min_days = 90,  target_age_max_days = 135 where key = 'laugh';
update public.goal_definitions set target_age_min_days = 120, target_age_max_days = 195 where key = 'roll';
update public.goal_definitions set target_age_min_days = 165, target_age_max_days = 240 where key = 'food';
update public.goal_definitions set target_age_min_days = 210, target_age_max_days = 320 where key = 'crawl';
update public.goal_definitions set target_age_min_days = 270, target_age_max_days = 430 where key = 'word';
update public.goal_definitions set target_age_min_days = 300, target_age_max_days = 560 where key = 'steps';

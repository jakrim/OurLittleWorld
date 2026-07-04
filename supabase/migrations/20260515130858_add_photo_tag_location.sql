alter table public.photo_tags
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_fetched_at timestamptz;

create index if not exists photo_tags_family_location_idx
  on public.photo_tags(family_id, latitude, longitude)
  where latitude is not null and longitude is not null;;

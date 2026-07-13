-- W2: quality-ranked digest representative media.
-- Only the v_representative_media selection changes from 20260622174500:
--   1. media whose moment is linked to a first saved this week ranks first
--      (milestone photos are the story), then
--   2. captureQuality from moment_media.metadata (written by the client since
--      W1) descending, then
--   3. recency + sort_order exactly as before — historical rows without the
--      metadata fall back to today's behavior via the -1 coalesce.

create or replace function public.assemble_weekly_digest(
  target_family_id uuid,
  target_week_start date default null
)
returns public.weekly_digests
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_week_start date;
  v_week_end date;
  v_moment_count integer := 0;
  v_milestone_count integer := 0;
  v_voice_note_count integer := 0;
  v_letter_count integer := 0;
  v_photo_count integer := 0;
  v_memory_count integer := 0;
  v_headline text;
  v_representative_media jsonb := '[]'::jsonb;
  v_digest public.weekly_digests%rowtype;
begin
  if target_family_id is null then
    raise exception 'target_family_id is required';
  end if;

  if auth.uid() is not null and not public.is_family_writer(target_family_id) then
    raise exception 'not allowed to assemble digest for this family';
  end if;

  v_week_start := coalesce(
    target_week_start,
    (current_date - extract(dow from current_date)::int)::date
  );
  v_week_end := (v_week_start + 6);

  select count(*)::integer into v_moment_count
  from public.moments m
  where m.family_id = target_family_id
    and (m.captured_at at time zone 'utc')::date between v_week_start and v_week_end;

  select count(*)::integer into v_photo_count
  from public.photo_tags p
  where p.family_id = target_family_id
    and p.upload_status = 'ready'
    and (p.creation_time at time zone 'utc')::date between v_week_start and v_week_end;

  select count(*)::integer into v_memory_count
  from public.memories mem
  where mem.family_id = target_family_id
    and (mem.created_at at time zone 'utc')::date between v_week_start and v_week_end;

  select count(*)::integer into v_milestone_count
  from public.firsts f
  where f.family_id = target_family_id
    and coalesce(f.done, true) = true
    and (coalesce(f.happened_at::timestamptz, f.created_at) at time zone 'utc')::date between v_week_start and v_week_end;

  select count(*)::integer into v_voice_note_count
  from public.voice_notes vn
  join public.moments m on m.id = vn.moment_id
  where vn.family_id = target_family_id
    and m.family_id = target_family_id
    and (m.captured_at at time zone 'utc')::date between v_week_start and v_week_end;

  select count(*)::integer into v_letter_count
  from public.letters l
  where l.family_id = target_family_id
    and (l.created_at at time zone 'utc')::date between v_week_start and v_week_end;

  select coalesce(jsonb_agg(item order by rank asc), '[]'::jsonb)
  into v_representative_media
  from (
    select
      row_number() over () as rank,
      jsonb_build_object(
        'momentId', m.id,
        'mediaId', mm.id,
        'mediaType', mm.media_type,
        'capturedAt', m.captured_at,
        'metadata', mm.metadata
      ) as item
    from public.moments m
    join public.moment_media mm on mm.moment_id = m.id
    where m.family_id = target_family_id
      and mm.family_id = target_family_id
      and (m.captured_at at time zone 'utc')::date between v_week_start and v_week_end
    order by
      exists (
        select 1
        from public.firsts f
        where f.family_id = target_family_id
          and f.moment_id = m.id
          and coalesce(f.done, true) = true
          and (coalesce(f.happened_at::timestamptz, f.created_at) at time zone 'utc')::date
            between v_week_start and v_week_end
      ) desc,
      case
        when mm.metadata->>'captureQuality' ~ '^[0-9]*\.?[0-9]+$'
          then (mm.metadata->>'captureQuality')::numeric
        else -1
      end desc,
      m.captured_at desc,
      mm.sort_order asc
    limit 4
  ) media;

  v_headline := case
    when v_milestone_count > 0 then 'A week with a first worth saving.'
    when v_voice_note_count > 0 then 'A week with voices kept close.'
    when v_moment_count > 0 or v_photo_count > 0 then 'A week of small arrivals.'
    when v_letter_count > 0 then 'A week with words saved for later.'
    else 'A quiet week, still worth keeping.'
  end;

  insert into public.weekly_digests (
    family_id,
    week_start,
    week_end,
    headline,
    photo_count,
    memory_count,
    firsts_count,
    letter_count,
    representative_media,
    moment_count,
    milestone_count,
    voice_note_count,
    generated_at
  )
  values (
    target_family_id,
    v_week_start,
    v_week_end,
    v_headline,
    v_photo_count,
    v_memory_count,
    v_milestone_count,
    v_letter_count,
    v_representative_media,
    greatest(v_moment_count, v_photo_count),
    v_milestone_count,
    v_voice_note_count,
    now()
  )
  on conflict (family_id, week_start) do update
    set week_end = excluded.week_end,
        headline = excluded.headline,
        photo_count = excluded.photo_count,
        memory_count = excluded.memory_count,
        firsts_count = excluded.firsts_count,
        letter_count = excluded.letter_count,
        representative_media = excluded.representative_media,
        moment_count = excluded.moment_count,
        milestone_count = excluded.milestone_count,
        voice_note_count = excluded.voice_note_count,
        generated_at = excluded.generated_at
  returning * into v_digest;

  return v_digest;
end
$$;

revoke all on function public.assemble_weekly_digest(uuid, date) from public, anon;
grant execute on function public.assemble_weekly_digest(uuid, date) to authenticated, service_role;;

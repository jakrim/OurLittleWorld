-- Rich letters can own photos, videos, and voice without creating timeline moments.
-- Letter-owned media remains writer-only, matching the privacy boundary on letters.

alter table public.moment_media
  alter column moment_id drop not null,
  add column if not exists letter_id uuid references public.letters(id) on delete cascade;

alter table public.voice_notes
  add column if not exists letter_id uuid references public.letters(id) on delete cascade;

do $$
begin
  alter table public.moment_media
    add constraint moment_media_one_parent_check
    check (num_nonnulls(moment_id, letter_id) = 1) not valid;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.voice_notes
    add constraint voice_notes_one_parent_check
    check (num_nonnulls(moment_id, letter_id) = 1) not valid;
exception
  when duplicate_object then null;
end $$;

create index if not exists moment_media_letter_idx
  on public.moment_media(letter_id, sort_order asc, created_at asc)
  where letter_id is not null;

create index if not exists voice_notes_letter_idx
  on public.voice_notes(letter_id, created_at asc)
  where letter_id is not null;

drop policy if exists moment_media_select on public.moment_media;
create policy moment_media_select on public.moment_media for select
  using (
    public.is_family_writer(family_id)
    or (
      moment_id is not null
      and public.is_family_circle_member(family_id)
      and public.is_moment_shared_with_circle(family_id, moment_id)
    )
  );

drop policy if exists voice_notes_select on public.voice_notes;
create policy voice_notes_select on public.voice_notes for select
  using (
    public.is_family_writer(family_id)
    or (
      moment_id is not null
      and public.is_family_circle_member(family_id)
      and public.is_moment_shared_with_circle(family_id, moment_id)
    )
  );

-- D3: preserve confirmed source links for letters created from moments/firsts.

alter table public.letters
  add column if not exists source_moment_id uuid references public.moments(id) on delete set null,
  add column if not exists source_first_id uuid references public.firsts(id) on delete set null;

create index if not exists letters_source_moment_idx
  on public.letters(family_id, source_moment_id)
  where source_moment_id is not null;

create index if not exists letters_source_first_idx
  on public.letters(family_id, source_first_id)
  where source_first_id is not null;

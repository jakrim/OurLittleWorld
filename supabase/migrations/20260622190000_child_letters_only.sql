-- Child letters only
-- Removes the older spouse-note schema branch now that Letters follows the
-- PRD time-capsule ritual for the child.

update public.letters
set audience = 'child'
where audience <> 'child';

alter table public.letters
  alter column audience set default 'child';

do $$
begin
  alter table public.letters drop constraint if exists letters_audience_check;
  alter table public.letters
    add constraint letters_audience_check check (audience = 'child');
end $$;

alter table public.letters
  drop column if exists starter_key;

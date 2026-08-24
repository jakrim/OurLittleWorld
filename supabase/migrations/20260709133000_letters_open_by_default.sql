-- H3 / Letters v2: letters are ongoing notes by default.
-- Null open_on means readable in the family vault immediately. Existing dated
-- letters keep the current sealed-until-date behavior.

alter table public.letters
  alter column open_on drop not null;

alter table public.letters
  alter column sealed_at drop not null,
  alter column sealed_at drop default;

create or replace function public.enqueue_letter_partner_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.enqueue_notification_event(
    new.family_id,
    'partner_activity',
    new.author_user_id,
    '/letters',
    'A letter was saved',
    'Your co-parent saved a letter to the family book.',
    'partner_letter:' || new.id::text,
    jsonb_build_object('kind', 'letter_saved', 'letter_id', new.id)
  );
  return new;
end
$$;

-- Preserve only the privacy-safe acquisition dimensions attached to a paid
-- checkout when the purchase is later connected to a family entitlement.

create or replace function public.attach_redeemed_acquisition_attribution(
  target_family_id uuid,
  target_user_id uuid,
  target_source text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_source_metadata jsonb := '{}'::jsonb;
  v_acquisition jsonb := '{}'::jsonb;
begin
  if target_source = 'gift' then
    select coalesce(gr.metadata -> 'acquisition', '{}'::jsonb)
      into v_source_metadata
    from public.gift_redemptions gr
    where gr.redeemed_family_id = target_family_id
      and gr.redeemed_by_user_id = target_user_id
      and gr.status = 'redeemed'
    order by gr.redeemed_at desc
    limit 1;
  elsif target_source = 'stripe' then
    select jsonb_build_object(
      'campaign', metadata ->> 'acquisition_campaign',
      'angle', metadata ->> 'acquisition_angle',
      'creative', metadata ->> 'acquisition_creative',
      'channel', metadata ->> 'acquisition_channel',
      'landing_page', metadata ->> 'acquisition_landing_page'
    )
      into v_source_metadata
    from public.billing_subscriptions
    where family_id = target_family_id
      and purchaser_user_id = target_user_id
      and claim_code_redeemed_at is not null
    order by claim_code_redeemed_at desc
    limit 1;
  else
    return '{}'::jsonb;
  end if;

  v_acquisition := jsonb_strip_nulls(jsonb_build_object(
    'campaign', v_source_metadata ->> 'campaign',
    'angle', v_source_metadata ->> 'angle',
    'creative', v_source_metadata ->> 'creative',
    'channel', v_source_metadata ->> 'channel',
    'landing_page', v_source_metadata ->> 'landing_page'
  ));

  if v_acquisition <> '{}'::jsonb then
    update public.family_entitlements
    set metadata = jsonb_set(metadata, '{acquisition}', v_acquisition, true),
        updated_at = now()
    where family_id = target_family_id
      and billing_owner_user_id = target_user_id
      and source = target_source;
  end if;

  return v_acquisition;
end
$$;

revoke all on function public.attach_redeemed_acquisition_attribution(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.attach_redeemed_acquisition_attribution(uuid, uuid, text)
  to service_role;

create or replace function public.get_my_family_acquisition_attribution(target_family_id uuid)
returns table (
  campaign text,
  angle text,
  creative text,
  channel text,
  landing_page text
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null or not public.is_family_member(target_family_id) then
    raise exception 'family attribution not found';
  end if;

  return query
  select
    fe.metadata #>> '{acquisition,campaign}',
    fe.metadata #>> '{acquisition,angle}',
    fe.metadata #>> '{acquisition,creative}',
    fe.metadata #>> '{acquisition,channel}',
    fe.metadata #>> '{acquisition,landing_page}'
  from public.family_entitlements fe
  where fe.family_id = target_family_id;
end
$$;

revoke all on function public.get_my_family_acquisition_attribution(uuid) from public, anon;
grant execute on function public.get_my_family_acquisition_attribution(uuid) to authenticated;

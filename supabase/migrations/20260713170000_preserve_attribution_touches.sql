-- Preserve privacy-safe first-touch and last-touch acquisition dimensions
-- through checkout, redemption, and the family entitlement ledger.

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
      'landing_page', metadata ->> 'acquisition_landing_page',
      'first_campaign', metadata ->> 'acquisition_first_campaign',
      'first_angle', metadata ->> 'acquisition_first_angle',
      'first_creative', metadata ->> 'acquisition_first_creative',
      'first_channel', metadata ->> 'acquisition_first_channel',
      'first_landing_page', metadata ->> 'acquisition_first_landing_page',
      'last_campaign', metadata ->> 'acquisition_last_campaign',
      'last_angle', metadata ->> 'acquisition_last_angle',
      'last_creative', metadata ->> 'acquisition_last_creative',
      'last_channel', metadata ->> 'acquisition_last_channel',
      'last_landing_page', metadata ->> 'acquisition_last_landing_page'
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
    'landing_page', v_source_metadata ->> 'landing_page',
    'first_campaign', v_source_metadata ->> 'first_campaign',
    'first_angle', v_source_metadata ->> 'first_angle',
    'first_creative', v_source_metadata ->> 'first_creative',
    'first_channel', v_source_metadata ->> 'first_channel',
    'first_landing_page', v_source_metadata ->> 'first_landing_page',
    'last_campaign', v_source_metadata ->> 'last_campaign',
    'last_angle', v_source_metadata ->> 'last_angle',
    'last_creative', v_source_metadata ->> 'last_creative',
    'last_channel', v_source_metadata ->> 'last_channel',
    'last_landing_page', v_source_metadata ->> 'last_landing_page'
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

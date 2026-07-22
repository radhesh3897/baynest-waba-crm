-- A lead who wants to BUY leads is not an ads client. We hand them to the team
-- but deliberately fire no Meta conversion event, so the ad algorithm keeps
-- optimising for real ad clients. Tag them instead so they are findable.
create or replace function public.tag_buy_leads(p_contact uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.contacts
     set attributes = jsonb_set(
           coalesce(attributes, '{}'::jsonb),
           '{tags}',
           coalesce(attributes->'tags', '[]'::jsonb) || '["buy-leads"]'::jsonb
         )
   where id = p_contact
     and not coalesce(attributes->'tags', '[]'::jsonb) @> '["buy-leads"]'::jsonb;
end;
$$;

revoke execute on function public.tag_buy_leads(uuid) from anon, authenticated;

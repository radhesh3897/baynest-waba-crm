-- Generic contact tagger (append one tag, deduped). Used to mark affiliate/MLM
-- leads the AI declines, so the team can see why the chat ended. SECURITY
-- DEFINER + granted ONLY to service_role (edge functions call it); revoked from
-- PUBLIC so anon/authenticated cannot reach it via /rpc.
create or replace function public.tag_contact(p_contact uuid, p_tag text)
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
           coalesce(attributes->'tags', '[]'::jsonb) || to_jsonb(p_tag)
         )
   where id = p_contact
     and not coalesce(attributes->'tags', '[]'::jsonb) @> to_jsonb(p_tag);
end;
$$;

revoke all on function public.tag_contact(uuid, text) from public, anon, authenticated;
grant execute on function public.tag_contact(uuid, text) to service_role;

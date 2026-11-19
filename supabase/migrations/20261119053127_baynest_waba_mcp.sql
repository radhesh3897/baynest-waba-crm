-- Access is provisioned explicitly. Future CRM sign-ups do not get MCP access.
create table public.mcp_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  can_write boolean not null default false,
  can_send boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.mcp_access enable row level security;
revoke all on public.mcp_access from public, anon, authenticated;
grant select on public.mcp_access to authenticated;
grant all on public.mcp_access to service_role;
create policy mcp_access_read_own on public.mcp_access for select
  to authenticated using (user_id = (select auth.uid()));

-- Existing Baynest agents retain their CRM access through the connector.
insert into public.mcp_access(user_id, can_write, can_send)
select p.id, true, true from public.profiles p join auth.users u on u.id=p.id;

create table public.mcp_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  tool text not null check (tool in ('update_lead','add_note','send_whatsapp')),
  -- Preserve the audit reference even when the CRM later deletes a contact.
  contact_id uuid not null,
  request_hash text not null check (length(request_hash)=64),
  status text not null default 'pending' check (status in ('pending','completed','failed','unknown')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id, request_id)
);
create index mcp_operations_user_created on public.mcp_operations(user_id,created_at desc);
alter table public.mcp_operations enable row level security;
revoke all on public.mcp_operations from public, anon, authenticated;
grant all on public.mcp_operations to service_role;

-- Only the authenticated Edge Function can reserve or finish an operation.
-- The row lock also serializes per-agent rate limiting across concurrent calls.
create function public.mcp_reserve_operation(
  p_user_id uuid, p_request_id uuid, p_tool text, p_contact_id uuid, p_hash text
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare access_row public.mcp_access; operation public.mcp_operations;
begin
  select * into access_row from public.mcp_access where user_id=p_user_id for update;
  if not found or not access_row.enabled
    or (p_tool='send_whatsapp' and not access_row.can_send)
    or (p_tool in ('update_lead','add_note') and not access_row.can_write) then
    raise exception 'MCP permission denied';
  end if;
  select * into operation from public.mcp_operations where user_id=p_user_id and request_id=p_request_id;
  if found then
    if operation.request_hash<>p_hash or operation.tool<>p_tool or operation.contact_id<>p_contact_id then
      raise exception 'request_id was already used for different arguments';
    end if;
    return jsonb_build_object('claimed',false,'operation',to_jsonb(operation));
  end if;
  if (select count(*) from public.mcp_operations where user_id=p_user_id and created_at>now()-interval '1 minute')>=20 then
    raise exception 'Too many changes. Wait one minute before trying again.';
  end if;
  insert into public.mcp_operations(user_id,request_id,tool,contact_id,request_hash)
  values(p_user_id,p_request_id,p_tool,p_contact_id,p_hash) returning * into operation;
  return jsonb_build_object('claimed',true,'operation',to_jsonb(operation));
end $$;
revoke all on function public.mcp_reserve_operation(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.mcp_reserve_operation(uuid,uuid,text,uuid,text) to service_role;

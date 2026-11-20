alter table public.mcp_access add column can_manage_templates boolean not null default false;
alter table public.mcp_operations alter column contact_id drop not null;
alter table public.mcp_operations drop constraint mcp_operations_tool_check;
alter table public.mcp_operations add constraint mcp_operations_tool_check
  check(tool in ('update_lead','add_note','send_whatsapp','create_template'));

-- Activate can_manage_templates and can_send after deploying the new MCP
-- version, which exposes the approved-template sender to these accounts.

create or replace function public.mcp_reserve_operation(
  p_user_id uuid, p_request_id uuid, p_tool text, p_contact_id uuid, p_hash text
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare access_row public.mcp_access; operation public.mcp_operations;
begin
  select * into access_row from public.mcp_access where user_id=p_user_id for update;
  if not found or not access_row.enabled
    or (p_tool='send_whatsapp' and not access_row.can_send)
    or (p_tool='create_template' and not access_row.can_manage_templates)
    or (p_tool in ('update_lead','add_note') and not access_row.can_write) then
    raise exception 'MCP permission denied';
  end if;
  select * into operation from public.mcp_operations where user_id=p_user_id and request_id=p_request_id;
  if found then
    if operation.request_hash<>p_hash or operation.tool<>p_tool
      or operation.contact_id is distinct from p_contact_id then
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

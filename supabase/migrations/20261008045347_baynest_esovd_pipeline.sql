-- E/S/O/V/D replaces the two UI boards. Legacy lead/deal storage remains
-- compatible with messaging workers: V/D stay protected from AI stage resets.
-- This migration does not enqueue messages or alter automation, visits or notes.
lock table public.contacts in share row exclusive mode;
lock table public.app_settings in share row exclusive mode;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.baynest_esovd_contact_backup_20261008 as
select id, lead_status, pipeline, updated_at, pipeline_moved_at,
       md5((to_jsonb(c) - array['lead_status','pipeline'])::text) as protected_hash
from public.contacts c;
alter table private.baynest_esovd_contact_backup_20261008 enable row level security;
revoke all on private.baynest_esovd_contact_backup_20261008 from public, anon, authenticated;
create table private.baynest_esovd_settings_backup_20261008 as
select id, pipeline_stages, deal_stages from public.app_settings;
alter table private.baynest_esovd_settings_backup_20261008 enable row level security;
revoke all on private.baynest_esovd_settings_backup_20261008 from public, anon, authenticated;

create or replace function public.canonical_pipeline_stage(p_stage text)
returns text language sql immutable set search_path = public as $fn$
select case p_stage
  when 'Not Qualified' then 'Not qualified' when 'NotQualified' then 'Not qualified' when 'Junk' then 'Not qualified'
  when 'Didn’t Pick Call' then 'Didn''t pick up' when 'Didn''t Pick Call' then 'Didn''t pick up' when 'Attempted' then 'Didn''t pick up'
  when 'Follow Up' then 'Call back later' when 'Hot' then 'Call back later'
  when 'Warm' then 'Contacted' when 'Cool' then 'New'
  when 'Looking to schedule visit' then 'Schedule visit'
  when 'Visit Scheduled' then 'Visit scheduled' when 'Visits' then 'Visit scheduled'
  when 'Offer Made' then 'Negotiation'
  when 'Booked' then 'Deal closed' when 'Won' then 'Deal closed' when 'Closed' then 'Deal closed'
  else coalesce(p_stage,'New') end
$fn$;

alter table public.app_settings add column pipeline_sections jsonb not null default '{"E": ["New", "Qualified", "Not qualified"], "S": ["Contacted", "Didn''t pick up", "Call back later", "Not interested"], "O": ["Options sent"], "V": ["Schedule visit", "Visit scheduled", "Visited"], "D": ["Negotiation", "Lost", "Deal closed"]}'::jsonb;

-- Preserve every non-stage field exactly, including original timestamps and
-- automatic/manual deal values. The existing audit trigger still logs moves.
alter table public.contacts disable trigger contacts_sync_pipeline_fields;
alter table public.contacts disable trigger trg_contacts_updated_at;
update public.contacts c set lead_status = case
  when b.pipeline = 'deal' and b.lead_status in ('Looking to schedule visit','Visit Scheduled','Visited','Offer Made','Negotiation') then 'Negotiation'
  else public.canonical_pipeline_stage(b.lead_status) end
from private.baynest_esovd_contact_backup_20261008 b
where b.id=c.id and c.lead_status is distinct from case
  when b.pipeline = 'deal' and b.lead_status in ('Looking to schedule visit','Visit Scheduled','Visited','Offer Made','Negotiation') then 'Negotiation'
  else public.canonical_pipeline_stage(b.lead_status) end;
alter table public.contacts enable trigger contacts_sync_pipeline_fields;
alter table public.contacts enable trigger trg_contacts_updated_at;

-- Guard both the settings RPC and direct settings writes. Required PDF stages
-- stay stable; a custom stage containing contacts cannot be removed or moved.
create or replace function public.validate_pipeline_sections()
returns trigger language plpgsql set search_path = public as $fn$
declare k text; v jsonb; required jsonb := '{"E": ["New", "Qualified", "Not qualified"], "S": ["Contacted", "Didn''t pick up", "Call back later", "Not interested"], "O": ["Options sent"], "V": ["Schedule visit", "Visit scheduled", "Visited"], "D": ["Negotiation", "Lost", "Deal closed"]}'::jsonb;
begin
  if jsonb_typeof(new.pipeline_sections) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(new.pipeline_sections)) <> 5
     or not new.pipeline_sections ?& array['E','S','O','V','D'] then
    raise exception 'Use exactly the E, S, O, V and D sections.';
  end if;
  for k, v in select * from jsonb_each(new.pipeline_sections) loop
    if jsonb_typeof(v) is distinct from 'array' then raise exception 'Each section must be a stage list.'; end if;
    if jsonb_array_length(v)=0 then raise exception 'Keep at least one stage per section.'; end if;
    if exists(select 1 from jsonb_array_elements(v) item where jsonb_typeof(item)<>'string'
       or length(trim(item #>> '{}'))=0 or trim(item #>> '{}') is distinct from (item #>> '{}')) then
      raise exception 'Stage names must be non-empty text without surrounding spaces.';
    end if;
    if not (v @> (required->k)) then raise exception 'Keep the standard Baynest stages in their original sections.'; end if;
  end loop;
  if exists(select lower(s) from jsonb_each(new.pipeline_sections) e, jsonb_array_elements_text(e.value) s
    group by lower(s) having count(*)>1) then raise exception 'Each stage name must be unique.'; end if;
  if exists(select 1 from jsonb_each(new.pipeline_sections) e, jsonb_array_elements_text(e.value) s
    where public.canonical_pipeline_stage(s)<>s) then raise exception 'Use the current Baynest stage names instead of legacy aliases.'; end if;
  if exists(select 1 from public.contacts c where not exists(
    select 1 from jsonb_each(new.pipeline_sections) e where e.value ? c.lead_status)) then
    raise exception 'A stage containing contacts cannot be removed or renamed.';
  end if;
  if tg_op='UPDATE' and old.pipeline_sections is not null and exists(
    select 1 from public.contacts c, jsonb_each(old.pipeline_sections) before_section
    where before_section.value ? c.lead_status
      and not ((new.pipeline_sections->before_section.key) ? c.lead_status)
  ) then raise exception 'A stage containing contacts cannot change sections.'; end if;
  new.pipeline_stages := (new.pipeline_sections->'E') || (new.pipeline_sections->'S') || (new.pipeline_sections->'O');
  new.deal_stages := (new.pipeline_sections->'V') || (new.pipeline_sections->'D');
  return new;
end $fn$;
create trigger validate_pipeline_sections before insert or update on public.app_settings
for each row execute function public.validate_pipeline_sections();
update public.app_settings set pipeline_sections='{"E": ["New", "Qualified", "Not qualified"], "S": ["Contacted", "Didn''t pick up", "Call back later", "Not interested"], "O": ["Options sent"], "V": ["Schedule visit", "Visit scheduled", "Visited"], "D": ["Negotiation", "Lost", "Deal closed"]}'::jsonb where id=1;

create or replace function public.save_pipeline_sections(p_sections jsonb)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  if auth.uid() is null then raise exception 'Sign in to update the pipeline.'; end if;
  -- Serialize settings edits against concurrent contact moves.
  lock table public.contacts in share row exclusive mode;
  update public.app_settings set pipeline_sections=p_sections where id=1;
  if not found then raise exception 'Workspace settings are unavailable.'; end if;
end $fn$;
revoke all on function public.save_pipeline_sections(jsonb) from public, anon;
grant execute on function public.save_pipeline_sections(jsonb) to authenticated;

create or replace function public.contacts_sync_pipeline_fields()
returns trigger language plpgsql set search_path = public as $fn$
declare config jsonb; section_key text;
begin
  new.lead_status := public.canonical_pipeline_stage(new.lead_status);
  select pipeline_sections into config from public.app_settings where id=1;
  select key into section_key from jsonb_each(config) e where e.value ? new.lead_status limit 1;
  if section_key is null then raise exception 'Choose a stage from the Baynest pipeline.'; end if;
  new.pipeline := case when section_key in ('V','D') then 'deal' else 'lead' end;
  if tg_op='UPDATE' and new.pipeline is distinct from old.pipeline then new.pipeline_moved_at:=now();
  elsif tg_op='INSERT' and new.pipeline='deal' then new.pipeline_moved_at:=now(); end if;
  if not new.deal_value_is_manual then
    new.deal_value_cr:=public.contact_auto_deal_value(new.id,new.attributes);
  end if;
  return new;
end $fn$;

-- Fail the entire transaction if any contact or protected field changed.
do $check$
begin
  if (select count(*) from public.contacts)<>(select count(*) from private.baynest_esovd_contact_backup_20261008) then
    raise exception 'Contact count changed during migration.';
  end if;
  if exists(select 1 from private.baynest_esovd_contact_backup_20261008 b
    left join public.contacts c on c.id=b.id
    where c.id is null or b.protected_hash<>md5((to_jsonb(c)-array['lead_status','pipeline'])::text)
       or c.pipeline is distinct from b.pipeline) then
    raise exception 'Migration changed a protected contact field.';
  end if;
  if exists(select 1 from public.contacts c, public.app_settings s where s.id=1
    and not exists(select 1 from jsonb_each(s.pipeline_sections) e where e.value ? c.lead_status)) then
    raise exception 'A contact would be hidden from the new pipeline.';
  end if;
end $check$;

CREATE OR REPLACE FUNCTION public.home_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with month_start as (select date_trunc('month', now()) as d)
  select jsonb_build_object(
    'sectionCounts', (select jsonb_object_agg(e.key,(select count(*) from contacts c where e.value ? c.lead_status)) from app_settings s, jsonb_each(s.pipeline_sections) e where s.id=1),
    'pipelineSections', (select pipeline_sections from app_settings where id=1),
    'leadsIn',        (select count(*) from contacts),
    'leadsMonth',     (select count(*) from contacts, month_start where contacts.created_at >= month_start.d),
    'conversations',  (select count(*) from conversations),
    -- Reached Qualified or moved past it into a deal.
    'qualified',      (select count(*) from contacts where pipeline = 'deal' or lead_status = 'Qualified'),
    'won',            (select count(*) from contacts where lead_status = 'Deal closed'),
    'sent',           (select count(*) from messages where direction = 'out'),
    'received',       (select count(*) from messages where direction = 'in'),
    'flowRuns',       (select count(*) from flow_runs),
    'activeFlows',    (select count(*) from flows where status = 'active'),
    'completedRuns',  (select count(*) from flow_runs where status = 'completed'),
    'newLeads',       (select count(*) from contacts where lead_status = 'New'),
    -- 'hot' now means the tag, not a stage.
    'hotLeads',       (select count(*) from contacts where temperature = 'hot'),
    'warmLeads',      (select count(*) from contacts where temperature = 'warm'),
    'coldLeads',      (select count(*) from contacts where temperature = 'cold'),
    'activeLeads',    (select count(*) from contacts where lead_status in (select jsonb_array_elements_text(pipeline_sections->'D') from app_settings where id=1) and lead_status not in ('Deal closed','Lost')),
    -- Board sizes
    'leadPipeline',   (select count(*) from contacts where pipeline = 'lead'),
    'dealPipeline',   (select count(*) from contacts where pipeline = 'deal'),
    -- One value per lead, never a sum of the projects they liked.
    'dealValueOpen',   coalesce((select sum(deal_value_cr) from contacts
                                  where lead_status in (select jsonb_array_elements_text(pipeline_sections->'D') from app_settings where id=1) and lead_status not in ('Deal closed','Lost')), 0),
    'dealValueBooked', coalesce((select sum(deal_value_cr) from contacts where lead_status = 'Deal closed'), 0),
    'unreadWa',       (select count(*) from conversations where unread_count > 0 and channel = 'whatsapp'),
    'unreadIg',       (select count(*) from conversations where unread_count > 0 and channel = 'instagram'),
    'properties',     (select count(*) from properties where active),
    'templates',      (select count(*) from templates where status = 'Approved'),
    'campaigns',      (select count(*) from campaigns),
    'tagged',         (select count(*) from lead_properties),
    'visitsUpcoming', (select count(*) from visits where status = 'scheduled' and scheduled_at >= now()),
    'visitsToday',    (select count(*) from visits where status = 'scheduled'
                        and scheduled_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
                        and scheduled_at <  (date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '1 day') at time zone 'Asia/Kolkata'),
    'recent', coalesce((
      select jsonb_agg(r) from (
        select c.id,
               coalesce(c.profile_name, c.wa_id, '@' || c.ig_username) as name,
               coalesce(c.source, '-')        as source,
               coalesce(c.lead_status, 'New') as status,
               c.temperature,
               c.pipeline,
               c.deal_value_cr,
               c.created_at
          from contacts c order by c.created_at desc limit 6
      ) r), '[]'::jsonb),
    'flows', coalesce((
      select jsonb_agg(f) from (
        select id, name, status from flows order by updated_at desc limit 6
      ) f), '[]'::jsonb)
  );
$function$

;

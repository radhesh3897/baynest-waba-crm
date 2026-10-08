-- Release the existing reminder UI with a verified, private Google connection.
alter table public.google_calendar_account alter column refresh_token drop not null;
alter table public.google_calendar_account add column if not exists auth_mode text default 'service_account';
alter table public.google_calendar_account add column if not exists service_account_email text;
alter table public.google_calendar_account add column if not exists verified_at timestamptz;
alter table public.reminders add column if not exists sync_revision bigint not null default 0;
alter table public.reminders add column if not exists sync_claimed_at timestamptz;

insert into public.google_calendar_account(singleton,calendar_id,auth_mode,time_zone)
values(true,'manish@baynestrealty.com','service_account','Asia/Kolkata')
on conflict(singleton) do update set calendar_id=excluded.calendar_id,auth_mode=excluded.auth_mode;

create or replace function public.reminders_touch()
returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_at:=now();
  if new.status='done' and old.status<>'done' then new.completed_at:=coalesce(new.completed_at,now()); end if;
  if (new.due_at,new.title,new.duration_min,new.notes,new.status,new.remind_min_before,new.kind)
     is distinct from (old.due_at,old.title,old.duration_min,old.notes,old.status,old.remind_min_before,old.kind) then
    new.sync_status:='pending'; new.sync_attempts:=0; new.sync_error:=null;
    new.sync_revision:=old.sync_revision+1;
  end if;
  return new;
end $$;

-- Browser writes are limited to reminder content. Mirror IDs, leases and errors
-- are maintained only by the worker, even with a valid staff login.
revoke insert,update,delete on public.reminders from authenticated;
grant insert(contact_id,conversation_id,title,notes,kind,due_at,duration_min,remind_min_before,status,created_by) on public.reminders to authenticated;
grant update(title,notes,kind,due_at,duration_min,remind_min_before,status) on public.reminders to authenticated;

drop function if exists public.google_calendar_status();
create function public.google_calendar_status()
returns table(connected boolean,calendar_id text,service_account_email text,time_zone text,last_sync_at timestamptz,last_error text)
language sql security definer set search_path=public as $$
 select a.verified_at is not null and a.last_error is null,a.calendar_id,a.service_account_email,a.time_zone,a.last_sync_at,a.last_error
 from public.google_calendar_account a where singleton and (auth.uid() is not null or auth.role()='service_role')
$$;
revoke all on function public.google_calendar_status() from public,anon;
grant execute on function public.google_calendar_status() to authenticated,service_role;

create or replace function public.set_google_calendar_target(p_calendar_id text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null and auth.role() is distinct from 'service_role' then raise exception 'Sign in first.'; end if;
 if p_calendar_id is distinct from 'manish@baynestrealty.com' then raise exception 'This workspace uses Manish''s calendar.'; end if;
 update public.google_calendar_account set calendar_id=p_calendar_id where singleton;
end $$;
revoke all on function public.set_google_calendar_target(text) from public,anon;
grant execute on function public.set_google_calendar_target(text) to authenticated,service_role;

-- Vault encrypts the Google key at rest. This RPC is worker-only and never
-- exposed to browser roles. The key is provisioned separately, never committed.
create function public.calendar_worker_config()
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker access required.'; end if;
 return jsonb_build_object(
  'service_account',(select decrypted_secret::jsonb from vault.decrypted_secrets where name='baynest_google_service_account'),
  'cron_secret',(select decrypted_secret from vault.decrypted_secrets where name='baynest_calendar_cron'));
end $$;
revoke all on function public.calendar_worker_config() from public,anon,authenticated;
grant execute on function public.calendar_worker_config() to service_role;

create function public.claim_calendar_reminder(p_id uuid)
returns setof public.reminders language sql security invoker set search_path=public as $$
 update public.reminders set sync_claimed_at=now()
 where id=p_id and auth.role()='service_role'
 and (sync_claimed_at is null or sync_claimed_at<now()-interval '2 minutes')
 returning *
$$;
revoke all on function public.claim_calendar_reminder(uuid) from public,anon,authenticated;
grant execute on function public.claim_calendar_reminder(uuid) to service_role;

do $$ begin
 if not exists(select 1 from vault.secrets where name='baynest_calendar_cron') then
   perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'baynest_calendar_cron','Calendar worker authentication');
 end if;
end $$;
select cron.schedule('baynest-calendar-reminders','*/2 * * * *',$cron$
 select net.http_post(
  url:='https://oeygcusojsznwuodbckz.supabase.co/functions/v1/calendar-sync',
  headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='baynest_calendar_cron')),
  body:='{}'::jsonb,timeout_milliseconds:=60000);
$cron$);

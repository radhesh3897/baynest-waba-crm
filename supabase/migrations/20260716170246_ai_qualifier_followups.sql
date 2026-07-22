-- Follow-up nudges for leads who go quiet mid-qualification.
--   nudge 1 - 20 minutes after we asked and got no reply
--   nudge 2 - ~20 hours in, i.e. 4 hours before the 24h window shuts for good
-- Both must land inside the 24h window, because outside it WhatsApp only allows
-- templates and a free-text nudge would simply be rejected.

alter table public.contacts add column if not exists ai_followups_sent int not null default 0;
alter table public.contacts add column if not exists ai_last_followup_at timestamptz;
comment on column public.contacts.ai_followups_sent is
  'How many follow-up nudges the AI qualifier has sent this lead (max 2). Doubles as the claim for the next one.';

-- Leads owed a nudge. The last message must be OURS: if theirs is last, the AI
-- owes them a reply instead and ai_qualify_candidates handles that case.
create or replace function public.ai_followup_candidates(p_limit int default 10)
returns table(contact_id uuid, conversation_id uuid, wa_id text, profile_name text, nudge int)
language sql
security definer
set search_path = public
as $$
  with base as (
    select c.id as contact_id, cv.id as conversation_id, c.wa_id,
           coalesce(c.profile_name, c.wa_id) as profile_name,
           c.ai_followups_sent, cv.window_expires_at,
           (select m.direction from messages m where m.conversation_id = cv.id
             order by m.created_at desc limit 1) as last_dir,
           (select max(m.created_at) from messages m where m.conversation_id = cv.id) as last_at
    from conversations cv
    join contacts c on c.id = cv.contact_id
    where c.ai_status = 'active'
      and c.qualification is null
      and cv.window_expires_at > now()
      and coalesce((select ai_qualify_enabled from app_settings where id = 1), false)
  )
  select contact_id, conversation_id, wa_id, profile_name,
         (case when ai_followups_sent = 0 then 1 else 2 end)::int as nudge
  from base
  where last_dir = 'out'
    and (
      (ai_followups_sent = 0 and last_at < now() - interval '20 minutes')
      or
      (ai_followups_sent = 1 and now() > window_expires_at - interval '4 hours')
    )
  order by last_at
  limit p_limit;
$$;

-- Claim the next nudge. Advances 0->1 or 1->2 atomically, so two runners can
-- never send the same nudge twice and a lead can never get more than two.
create or replace function public.ai_followup_claim(p_contact uuid, p_nudge int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update public.contacts
     set ai_followups_sent = p_nudge,
         ai_last_followup_at = now()
   where id = p_contact
     and ai_followups_sent = p_nudge - 1
     and ai_status = 'active'
     and qualification is null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke execute on function public.ai_followup_candidates(int)      from anon, authenticated;
revoke execute on function public.ai_followup_claim(uuid, int)     from anon, authenticated;

-- Safety net for the AI lead qualifier: if the webhook ever fails to reply to a
-- lead (isolate reclaimed, Claude blip, send failure), a cron picks it up.

alter table public.contacts add column if not exists ai_last_run_at timestamptz;
comment on column public.contacts.ai_last_run_at is
  'When the AI qualifier last ran for this contact. Used to claim work so two runners cannot double-reply.';

-- Leads the qualifier still owes a reply to. Two cases:
--   never greeted    - a recent first-time chat with no outbound at all
--   stalled mid-chat - the AI is active but the last message is still theirs
-- Guards: only chats opened in the last 24h (so it can never wake an old
-- conversation), the 24h send window must be open, the global kill switch must
-- be on, and the last message must be >2 min old (so it never races the webhook
-- while that is still working normally).
create or replace function public.ai_qualify_candidates(p_limit int default 10)
returns table(contact_id uuid, conversation_id uuid, wa_id text, profile_name text)
language sql
security definer
set search_path = public
as $$
  select c.id, cv.id, c.wa_id, coalesce(c.profile_name, c.wa_id)
  from conversations cv
  join contacts c on c.id = cv.contact_id
  where c.qualification is null
    and cv.window_expires_at > now()
    and cv.created_at > now() - interval '24 hours'
    and (c.ai_last_run_at is null or c.ai_last_run_at < now() - interval '2 minutes')
    and coalesce((select ai_qualify_enabled from app_settings where id = 1), false)
    and (select max(m.created_at) from messages m where m.conversation_id = cv.id) < now() - interval '2 minutes'
    and (
      (
        c.ai_status is null
        and not exists (select 1 from messages m where m.conversation_id = cv.id and m.direction = 'out')
        and exists     (select 1 from messages m where m.conversation_id = cv.id and m.direction = 'in')
      )
      or (
        c.ai_status = 'active'
        and (select m.direction from messages m where m.conversation_id = cv.id order by m.created_at desc limit 1) = 'in'
      )
    )
  order by cv.created_at
  limit p_limit;
$$;

-- Claim a contact for exactly one qualifier run. False = someone else holds it.
create or replace function public.ai_qualify_claim(p_contact uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update public.contacts
     set ai_status = 'active', ai_last_run_at = now()
   where id = p_contact
     and qualification is null
     and (ai_last_run_at is null or ai_last_run_at < now() - interval '2 minutes');
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Service role only: these drive real WhatsApp sends.
revoke execute on function public.ai_qualify_candidates(int) from anon, authenticated;
revoke execute on function public.ai_qualify_claim(uuid)     from anon, authenticated;

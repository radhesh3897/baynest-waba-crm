-- Security hardening batch A (no app-facing behavior change)

-- 1. flow_metrics(): stop anon/public execution; run as the caller so it honors
--    RLS instead of being an owner-privileged bypass. Authenticated keeps access.
revoke execute on function public.flow_metrics() from anon, public;
alter function public.flow_metrics() security invoker;

-- 2. webhook_events: internal processing log — remove the authenticated read
--    policy so raw inbound PII is service-role only (the UI never reads it).
drop policy if exists "webhook_events: read only" on public.webhook_events;

-- 3. conversations: prevent duplicate threads per contact (closes the
--    find-then-insert race). No existing duplicates, so this applies cleanly.
alter table public.conversations
  add constraint conversations_contact_id_key unique (contact_id);

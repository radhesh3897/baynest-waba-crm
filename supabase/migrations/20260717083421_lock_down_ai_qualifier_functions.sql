-- SECURITY FIX. These SECURITY DEFINER functions were reachable by anyone holding
-- the public anon key (it ships in the browser bundle and in qualifier.html), which
-- exposed lead phone numbers via ai_qualify_candidates / ai_followup_candidates and
-- let anyone mutate contact state via the claim + tag functions.
--
-- The earlier migrations said `revoke execute ... from anon, authenticated`, which
-- is a no-op: Postgres grants EXECUTE to PUBLIC by default at CREATE FUNCTION, and
-- anon/authenticated inherit it THROUGH PUBLIC. The grant has to be revoked from
-- PUBLIC itself. (Compare enroll_into_flows, which was locked down correctly.)
--
-- Only the edge functions call these, and they use the service_role key, which
-- holds its own explicit grant and is unaffected.

revoke all on function public.ai_qualify_candidates(int)        from public, anon, authenticated;
revoke all on function public.ai_qualify_claim(uuid)            from public, anon, authenticated;
revoke all on function public.ai_followup_candidates(int)       from public, anon, authenticated;
revoke all on function public.ai_followup_claim(uuid, int)      from public, anon, authenticated;
revoke all on function public.tag_buy_leads(uuid)               from public, anon, authenticated;

-- Explicit and unambiguous: only the service role may run them.
grant execute on function public.ai_qualify_candidates(int)     to service_role;
grant execute on function public.ai_qualify_claim(uuid)         to service_role;
grant execute on function public.ai_followup_candidates(int)    to service_role;
grant execute on function public.ai_followup_claim(uuid, int)   to service_role;
grant execute on function public.tag_buy_leads(uuid)            to service_role;

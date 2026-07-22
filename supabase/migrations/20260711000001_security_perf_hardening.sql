-- Security + performance hardening from the 2026-07-11 audit.
-- Safe to run once. Review before applying (it changes RLS/storage policies).

-- ── 1. Covering indexes for foreign keys ────────────────────────────────────
-- Speeds up joins and cascade deletes; flagged by the performance advisor.
create index if not exists idx_campaign_recipients_contact on public.campaign_recipients(contact_id);
create index if not exists idx_conversations_assigned_to  on public.conversations(assigned_to);
create index if not exists idx_fb_forms_page              on public.fb_forms(page_id);
create index if not exists idx_messages_contact           on public.messages(contact_id);
create index if not exists idx_messages_sent_by           on public.messages(sent_by);
create index if not exists idx_seq_enrollments_contact    on public.sequence_enrollments(contact_id);

-- ── 2. RLS init-plan fix on profiles ────────────────────────────────────────
-- Evaluate auth.uid() once per query instead of once per row.
drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid()));

-- ── 3. Remove redundant duplicate policy on flow_runs ───────────────────────
-- The "flow_runs: full access" ALL policy already grants SELECT.
drop policy if exists flow_runs_select_authenticated on public.flow_runs;

-- ── 4. Lock down the wa-media storage bucket ────────────────────────────────
-- Stop anonymous ENUMERATION of every uploaded file while keeping public object
-- URLs working (a public bucket serves /object/public/... without this policy).
drop policy if exists "wa_media_public_read" on storage.objects;
-- Remove the duplicate upload policy (two identical INSERT policies exist).
drop policy if exists "wa-media auth upload" on storage.objects;

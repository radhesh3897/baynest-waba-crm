-- Capture-method tag for the Leads Overview page. Distinct from the existing
-- `source` column (which stores channel: Meta Lead Ads / Website / Manual …).
alter table public.contacts add column if not exists source_type text;

-- One-time backfill: ctwa_clid => ctwa; else lead_id/form_id => instant_form; else unknown.
update public.contacts
set source_type = case
  when ctwa_clid is not null then 'ctwa'
  when (attributes->>'meta_lead_id') is not null or form_id is not null then 'instant_form'
  else 'unknown'
end
where source_type is null;

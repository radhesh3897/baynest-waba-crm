alter table public.contacts
  add column if not exists ctwa_clid text,
  add column if not exists ctwa_clid_captured_at timestamptz,
  add column if not exists ctwa_event_fired boolean not null default false,
  add column if not exists ctwa_fired_at timestamptz,
  add column if not exists ctwa_status text;

-- Fast lookups when firing / auditing CTWA leads.
create index if not exists idx_contacts_ctwa_clid on public.contacts(ctwa_clid) where ctwa_clid is not null;

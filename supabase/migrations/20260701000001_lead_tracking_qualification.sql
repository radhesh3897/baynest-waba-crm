-- Lead tracking + qualification (Conversions API)

-- Qualification fields on existing (form/manual) leads
alter table public.contacts
  add column if not exists qualification text,
  add column if not exists qualified_at timestamptz,
  add column if not exists capi_status text;

-- CSV-imported lead-gen-id rows (not real WhatsApp contacts) for CAPI tracking
create table if not exists public.tracking_leads (
  id uuid primary key default gen_random_uuid(),
  lead_id text,
  name text,
  phone text,
  email text,
  attributes jsonb not null default '{}'::jsonb,
  qualification text,
  qualified_at timestamptz,
  capi_status text,
  upload_date date not null default ((now() at time zone 'utc')::date),
  created_at timestamptz not null default now()
);
create unique index if not exists tracking_leads_lead_id_key on public.tracking_leads (lead_id) where lead_id is not null;
alter table public.tracking_leads enable row level security;
drop policy if exists "tracking_leads all (authenticated)" on public.tracking_leads;
create policy "tracking_leads all (authenticated)" on public.tracking_leads
  for all to authenticated using (true) with check (true);

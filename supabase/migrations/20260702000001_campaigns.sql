-- Bulk WhatsApp campaigns + retrying sender

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_name text not null,
  template_language text not null default 'en',
  variables jsonb not null default '[]'::jsonb,
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  wa_id text not null,
  first_name text,
  status text not null default 'queued',
  attempts int not null default 0,
  max_attempts int not null default 3,
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  wa_message_id text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists campaign_recipients_campaign_idx on public.campaign_recipients (campaign_id);
create index if not exists campaign_recipients_due_idx on public.campaign_recipients (status, next_attempt_at);

alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
drop policy if exists "campaigns all (auth)" on public.campaigns;
drop policy if exists "campaign_recipients all (auth)" on public.campaign_recipients;
create policy "campaigns all (auth)" on public.campaigns for all to authenticated using (true) with check (true);
create policy "campaign_recipients all (auth)" on public.campaign_recipients for all to authenticated using (true) with check (true);

-- Run the campaign sender every minute (batched; retries handled in the function).
select cron.schedule('campaign-run', '* * * * *', $$
  select net.http_post(
    url := 'https://rkmngnkgesteohigvsxe.supabase.co/functions/v1/campaign-run',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb
  );
$$);

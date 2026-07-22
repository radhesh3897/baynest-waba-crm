-- AI qualifier state on contacts and a global toggle in settings.
alter table public.contacts add column if not exists ai_status text;
comment on column public.contacts.ai_status is
  'AI qualifier state: null=never engaged, active=qualifying, done=qualified & handed off, off=human took over';

-- Global on/off for the auto AI qualifier (default ON; user can pause instantly).
alter table public.app_settings add column if not exists ai_qualify_enabled boolean not null default true;

-- Fast lookup of contacts the follow-up cron will need later.
create index if not exists idx_contacts_ai_status on public.contacts(ai_status) where ai_status = 'active';

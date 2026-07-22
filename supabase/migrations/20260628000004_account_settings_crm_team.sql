-- Editable CRM pipeline stages (used by the Kanban + lead statuses).
alter table public.app_settings add column if not exists pipeline_stages jsonb
  default '["New","Cool","Warm","Hot","Won","Lost"]'::jsonb;
update public.app_settings
  set pipeline_stages = '["New","Cool","Warm","Hot","Won","Lost"]'::jsonb
  where pipeline_stages is null;

-- Team roster (directory of people on the workspace).
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  role text default 'Member',
  created_at timestamptz not null default now()
);
alter table public.team_members enable row level security;
drop policy if exists team_members_all_authenticated on public.team_members;
create policy team_members_all_authenticated on public.team_members
  for all to authenticated using (true) with check (true);

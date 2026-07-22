-- ============================================================
-- DFY WhatsApp — Initial Schema
-- 20260625000001_initial_schema.sql
-- Single-tenant, internal team tool, no billing/multi-tenancy.
-- ============================================================

-- ── 0. Extensions ────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. TABLES  (creation order respects FK dependencies)
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────
-- Mirrors auth.users; one row per team member, auto-inserted on first login via trigger.
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  role        text not null default 'agent',   -- 'agent' | 'admin'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── fb_pages ──────────────────────────────────────────────────
create table if not exists public.fb_pages (
  id               uuid primary key default uuid_generate_v4(),
  page_id          text not null unique,
  name             text,
  access_token_ref text,   -- label/vault-ref only — NEVER the actual token
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── fb_forms ──────────────────────────────────────────────────
create table if not exists public.fb_forms (
  id         uuid primary key default uuid_generate_v4(),
  form_id    text not null unique,
  page_id    uuid references public.fb_pages(id) on delete set null,
  name       text,
  fields     jsonb not null default '[]',  -- [{key,label}, ...]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── contacts ──────────────────────────────────────────────────
create table if not exists public.contacts (
  id               uuid primary key default uuid_generate_v4(),
  wa_id            text not null unique,          -- +919820011234 (normalised with +)
  profile_name     text,
  email            text,
  company          text,
  job_title        text,
  opted_in         boolean not null default false,
  opt_in_at        timestamptz,
  lead_score       integer not null default 0,
  lead_status      text not null default 'New',   -- New|Cool|Warm|Hot|Won|Lost
  source           text,
  last_inbound_at  timestamptz,
  attributes       jsonb not null default '{}',   -- form-specific values, keyed by fb_forms.fields[].key
  form_id          uuid references public.fb_forms(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── conversations ─────────────────────────────────────────────
create table if not exists public.conversations (
  id                uuid primary key default uuid_generate_v4(),
  contact_id        uuid not null references public.contacts(id) on delete cascade,
  last_message_at   timestamptz,
  window_expires_at timestamptz,  -- null = no inbound yet; expired = template-only
  unread_count      integer not null default 0,
  assigned_to       uuid references public.profiles(id) on delete set null,
  status            text not null default 'open',  -- 'open' | 'closed'
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── messages ──────────────────────────────────────────────────
create table if not exists public.messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id      uuid not null references public.contacts(id) on delete cascade,
  wa_message_id   text unique,    -- WAMID; used for dedup and status updates
  direction       text not null check (direction in ('in', 'out')),
  type            text not null default 'text',
  body            text,
  template_name   text,
  payload         jsonb,
  status          text not null default 'received',  -- received|sent|delivered|read|failed
  error           jsonb,
  sent_by         uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── templates ─────────────────────────────────────────────────
create table if not exists public.templates (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null unique,
  language   text not null default 'en',
  category   text not null,   -- 'Marketing' | 'Utility' | 'Authentication'
  body       text not null,
  variables  jsonb not null default '{}',
  status     text not null default 'pending',  -- 'pending' | 'Approved' | 'Rejected'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── sequences ─────────────────────────────────────────────────
create table if not exists public.sequences (
  id             uuid primary key default uuid_generate_v4(),
  name           text not null,
  status         text not null default 'draft',   -- 'draft' | 'active' | 'paused'
  exit_on_reply  boolean not null default true,
  trigger_type   text not null default 'manual',  -- 'manual' | 'on_new_contact'
  trigger_config jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── sequence_steps ────────────────────────────────────────────
create table if not exists public.sequence_steps (
  id                  uuid primary key default uuid_generate_v4(),
  sequence_id         uuid not null references public.sequences(id) on delete cascade,
  position            integer not null,
  template_name       text not null,
  template_language   text not null default 'en',
  delay_after_minutes integer not null default 0,
  created_at          timestamptz not null default now(),
  unique(sequence_id, position)
);

-- ── sequence_enrollments ──────────────────────────────────────
create table if not exists public.sequence_enrollments (
  id               uuid primary key default uuid_generate_v4(),
  sequence_id      uuid not null references public.sequences(id) on delete cascade,
  contact_id       uuid not null references public.contacts(id) on delete cascade,
  current_position integer not null default 0,
  status           text not null default 'active',  -- 'active' | 'completed' | 'exited'
  next_run_at      timestamptz,
  last_step_at     timestamptz,
  exit_reason      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique(sequence_id, contact_id)
);

-- ── webhook_events ────────────────────────────────────────────
-- Raw inbound log — written by Edge Function service role, read-only for team.
create table if not exists public.webhook_events (
  id          uuid primary key default uuid_generate_v4(),
  event_type  text,
  raw         jsonb not null,
  processed   boolean not null default false,
  received_at timestamptz not null default now()
);

-- ============================================================
-- 2. INDEXES
-- ============================================================
create index if not exists idx_contacts_wa_id             on public.contacts(wa_id);
create index if not exists idx_contacts_lead_status       on public.contacts(lead_status);
create index if not exists idx_contacts_form_id           on public.contacts(form_id);
create index if not exists idx_conversations_contact      on public.conversations(contact_id);
create index if not exists idx_conversations_status       on public.conversations(status);
create index if not exists idx_conversations_last_msg     on public.conversations(last_message_at desc);
create index if not exists idx_messages_conversation      on public.messages(conversation_id);
create index if not exists idx_messages_wa_message_id     on public.messages(wa_message_id);
create index if not exists idx_messages_direction         on public.messages(direction);
create index if not exists idx_messages_created           on public.messages(created_at desc);
create index if not exists idx_webhook_events_processed   on public.webhook_events(processed);
create index if not exists idx_seq_enrollments_status     on public.sequence_enrollments(status);
create index if not exists idx_seq_enrollments_next_run   on public.sequence_enrollments(next_run_at);

-- ============================================================
-- 3. TRIGGERS
-- ============================================================

-- 3a. Auto-stamp updated_at on every UPDATE
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'profiles', 'fb_pages', 'fb_forms', 'contacts', 'conversations',
    'messages', 'templates', 'sequences', 'sequence_enrollments'
  ] loop
    execute format(
      'create or replace trigger trg_%1$s_updated_at
         before update on public.%1$s
         for each row execute function public.set_updated_at()',
      tbl
    );
  end loop;
end;
$$;

-- 3b. On message INSERT: update conversation timestamps + unread; refresh contact
create or replace function public.handle_new_message()
returns trigger language plpgsql
security definer set search_path = public as $$
begin
  -- Always update last_message_at
  update public.conversations
  set last_message_at = new.created_at,
      updated_at      = now()
  where id = new.conversation_id;

  -- Inbound: reset 24h window, bump unread, touch contact
  if new.direction = 'in' then
    update public.conversations
    set window_expires_at = now() + interval '24 hours',
        unread_count      = unread_count + 1,
        updated_at        = now()
    where id = new.conversation_id;

    update public.contacts
    set last_inbound_at = new.created_at,
        updated_at      = now()
    where id = new.contact_id;
  end if;

  return new;
end;
$$;

create trigger trg_messages_handle_new
  after insert on public.messages
  for each row execute function public.handle_new_message();

-- 3c. Auto-create profile row on first sign-in
create or replace function public.handle_new_user()
returns trigger language plpgsql
security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger trg_auth_users_new_profile
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles             enable row level security;
alter table public.fb_pages             enable row level security;
alter table public.fb_forms             enable row level security;
alter table public.contacts             enable row level security;
alter table public.conversations        enable row level security;
alter table public.messages             enable row level security;
alter table public.templates            enable row level security;
alter table public.sequences            enable row level security;
alter table public.sequence_steps       enable row level security;
alter table public.sequence_enrollments enable row level security;
alter table public.webhook_events       enable row level security;

-- profiles: read everyone's, write only own row
create policy "profiles: read all"
  on public.profiles for select to authenticated using (true);
create policy "profiles: insert own"
  on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles: update own"
  on public.profiles for update to authenticated using (id = auth.uid());

-- All business tables: full access for authenticated team members.
-- Edge Functions run as service_role and bypass RLS entirely — no policy needed for them.
create policy "contacts: full access"
  on public.contacts for all to authenticated using (true) with check (true);
create policy "conversations: full access"
  on public.conversations for all to authenticated using (true) with check (true);
create policy "messages: full access"
  on public.messages for all to authenticated using (true) with check (true);
create policy "templates: full access"
  on public.templates for all to authenticated using (true) with check (true);
create policy "sequences: full access"
  on public.sequences for all to authenticated using (true) with check (true);
create policy "sequence_steps: full access"
  on public.sequence_steps for all to authenticated using (true) with check (true);
create policy "sequence_enrollments: full access"
  on public.sequence_enrollments for all to authenticated using (true) with check (true);
create policy "fb_pages: full access"
  on public.fb_pages for all to authenticated using (true) with check (true);
create policy "fb_forms: full access"
  on public.fb_forms for all to authenticated using (true) with check (true);
-- webhook_events: read-only for team (appended only by service-role Edge Function)
create policy "webhook_events: read only"
  on public.webhook_events for select to authenticated using (true);

-- ============================================================
-- 5. REALTIME
-- ============================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;

-- ============================================================
-- 6. AUTH NOTE
-- ============================================================
-- Public sign-up must be disabled manually in the Supabase Dashboard:
--   Authentication > Settings > "Allow new users to sign up" → OFF
-- The CLI config (config.toml [auth] enable_signup = false) covers local dev.

-- Reminders on a lead, mirrored into Google Calendar.
--
-- Deliberately EVENTS, not Google Tasks: the Tasks API stores only a date and
-- discards the time, so "call at 3pm" would arrive as a silent all-day item.
-- An event carries a real clock time and can fire reminder overrides.

-- ── The connected calendar ──────────────────────────────────────────────────
-- Holds a refresh token, so it must never be readable by the browser. No
-- policies are created below and RLS is on: that denies every anon/authenticated
-- request outright. Only the service role (edge functions) can see it.
create table if not exists public.google_calendar_account (
  id                uuid primary key default uuid_generate_v4(),
  singleton         boolean not null default true,
  google_email      text,
  calendar_id       text not null default 'primary',
  time_zone         text not null default 'Asia/Kolkata',
  refresh_token     text not null,
  access_token      text,
  access_expires_at timestamptz,
  scope             text,
  connected_at      timestamptz not null default now(),
  connected_by      uuid references public.profiles(id) on delete set null,
  last_sync_at      timestamptz,
  last_error        text
);

-- One calendar only. Reconnecting overwrites rather than quietly adding a
-- second account that nothing would ever read.
create unique index if not exists google_calendar_account_one
  on public.google_calendar_account (singleton);

alter table public.google_calendar_account enable row level security;

-- ── Reminders ───────────────────────────────────────────────────────────────
create table if not exists public.reminders (
  id              uuid primary key default uuid_generate_v4(),
  contact_id      uuid references public.contacts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  title           text not null,
  notes           text,
  kind            text not null default 'call',     -- call | meeting | site_visit | follow_up
  due_at          timestamptz not null,
  duration_min    integer not null default 30,
  remind_min_before integer not null default 10,
  status          text not null default 'open',     -- open | done | cancelled
  -- Google mirror state. sync_status is what the retry sweep keys off.
  google_event_id text,
  google_link     text,
  sync_status     text not null default 'pending',  -- pending | synced | failed | disabled
  sync_error      text,
  sync_attempts   integer not null default 0,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists reminders_contact_idx on public.reminders (contact_id, due_at desc);
create index if not exists reminders_due_idx     on public.reminders (due_at) where status = 'open';
-- Partial index for the retry sweep: it only ever scans unsynced rows.
create index if not exists reminders_sync_idx    on public.reminders (sync_status)
  where sync_status in ('pending', 'failed');

alter table public.reminders enable row level security;
drop policy if exists "reminders all (auth)" on public.reminders;
create policy "reminders all (auth)" on public.reminders
  for all to authenticated using (true) with check (true);

-- Any edit to the schedule invalidates the Google mirror, so the sweep picks it
-- up again. Without this, moving a reminder would silently leave the calendar
-- showing the old time.
create or replace function public.reminders_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'done' and old.status <> 'done' then
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  if (new.due_at, new.title, new.duration_min, new.notes, new.status)
     is distinct from (old.due_at, old.title, old.duration_min, old.notes, old.status)
     and new.sync_status = 'synced' then
    new.sync_status  := 'pending';
    new.sync_attempts := 0;
  end if;
  return new;
end $$;

drop trigger if exists reminders_touch_trg on public.reminders;
create trigger reminders_touch_trg before update on public.reminders
  for each row execute function public.reminders_touch();

-- ── Connection status for the UI ────────────────────────────────────────────
-- The frontend needs to know IF a calendar is connected without ever being able
-- to read the token. SECURITY DEFINER reaches past RLS and returns only the
-- three harmless fields.
create or replace function public.google_calendar_status()
returns table (connected boolean, google_email text, calendar_id text,
               connected_at timestamptz, last_error text)
language sql security definer set search_path = public as $$
  select true, a.google_email, a.calendar_id, a.connected_at, a.last_error
  from public.google_calendar_account a limit 1
$$;

revoke all on function public.google_calendar_status() from public;
grant execute on function public.google_calendar_status() to authenticated, service_role;

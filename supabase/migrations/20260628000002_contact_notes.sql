-- Timestamped notes per contact (call remarks / log, Zoho-style).
create table if not exists public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  body text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.contact_notes enable row level security;
drop policy if exists contact_notes_all_authenticated on public.contact_notes;
create policy contact_notes_all_authenticated on public.contact_notes
  for all to authenticated using (true) with check (true);
create index if not exists contact_notes_contact_idx on public.contact_notes (contact_id, created_at desc);

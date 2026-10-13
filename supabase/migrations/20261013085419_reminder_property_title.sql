-- Store the selected name so reminder edits can regenerate the title reliably.
alter table public.reminders add column if not exists property_name text;
grant insert(property_name), update(property_name) on public.reminders to authenticated;

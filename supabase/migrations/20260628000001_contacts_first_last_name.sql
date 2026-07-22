-- Auto-split the WhatsApp/Meta registered name into first + last name.
-- Generated STORED columns => maintained automatically for every existing row
-- and every future lead (ingest + inbound), no edge-function changes needed.
-- "Radhesh Agrawal"       -> first_name=Radhesh, last_name=Agrawal
-- "Radhesh"               -> first_name=Radhesh, last_name=NULL
-- "Radhesh Kumar Agrawal" -> first_name=Radhesh, last_name="Kumar Agrawal"
alter table public.contacts
  add column if not exists first_name text
    generated always as (
      split_part(btrim(coalesce(profile_name, '')), ' ', 1)
    ) stored,
  add column if not exists last_name text
    generated always as (
      nullif(
        ltrim(
          substr(
            btrim(coalesce(profile_name, '')),
            length(split_part(btrim(coalesce(profile_name, '')), ' ', 1)) + 1
          )
        ),
        ''
      )
    ) stored;

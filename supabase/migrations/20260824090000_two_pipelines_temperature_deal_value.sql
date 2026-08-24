-- ════════════════════════════════════════════════════════════════════════════
-- Two pipelines + lead temperature + deal value
--
-- Structural change. Until now a contact had one flat `lead_status` and the
-- board showed every lead in one row of columns. Real estate does not work that
-- way: everything before the advisor gets them on a call is lead chasing, and
-- everything after it is a deal with money attached. Those need separate boards
-- with separate stages, and only the second one carries a forecast.
--
--   Lead pipeline  New -> Attempted -> Contacted -> Follow Up -> Qualified (+ Junk)
--   Deal pipeline  Visit Scheduled -> Visited -> Offer Made -> Negotiation -> Booked (+ Lost)
--
-- `lead_status` stays the single source of truth for which column a contact sits
-- in; `pipeline` is derived from it by trigger so a drag-and-drop that only sets
-- the stage can never leave the two disagreeing.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Budget, parsed out of whatever the ad form happened to call the field ────
-- Three live Meta forms name this three different ways and format the value
-- four different ways: '3-5cr', 'above_10cr', '₹13_cr', '₹18_cr+', '₹2–5_cr'.
-- We take the FIRST number, i.e. the floor of a range. A forecast built on
-- floors is one Manish can defend; midpoints quietly inflate the pipeline.
create or replace function public.lead_budget_cr(attrs jsonb)
returns numeric language plpgsql immutable parallel safe as $fn$
declare
  k text; v text; norm text; n numeric;
begin
  if attrs is null or jsonb_typeof(attrs) <> 'object' then return null; end if;
  for k, v in
    select key, value from jsonb_each_text(
      case when jsonb_typeof(attrs->'form_answers') = 'object'
           then attrs->'form_answers' else '{}'::jsonb end)
    union all
    select key, value from jsonb_each_text(attrs)
  loop
    continue when k !~* 'budget';
    -- '₹3–5_cr' -> ' 3 5 cr'   ·   'above_10cr' -> 'above 10cr'
    norm := regexp_replace(lower(coalesce(v, '')), '[₹_–—,]', ' ', 'g');
    n := (regexp_match(norm, '([0-9]+(?:\.[0-9]+)?)'))[1]::numeric;
    if n is not null then
      -- A form that asks in lakh rather than crore would otherwise read as a
      -- hundred-fold whale.
      if norm ~ '(lakh|lacs?|\ml\M)' and norm !~ 'cr' then n := n / 100.0; end if;
      return n;
    end if;
  end loop;
  return null;
end $fn$;

-- ── Timeline, in months, as an upper bound ──────────────────────────────────
-- 'within_1_month'->1, '1–3_months'->3, '3–6_months'->6, 'just_exploring'->999.
-- Upper bound because the question is "how soon at the LATEST".
create or replace function public.lead_timeline_months(attrs jsonb)
returns numeric language plpgsql immutable parallel safe as $fn$
declare
  k text; v text; norm text; hits text[]; n numeric; i int;
begin
  if attrs is null or jsonb_typeof(attrs) <> 'object' then return null; end if;
  for k, v in
    select key, value from jsonb_each_text(
      case when jsonb_typeof(attrs->'form_answers') = 'object'
           then attrs->'form_answers' else '{}'::jsonb end)
    union all
    select key, value from jsonb_each_text(attrs)
  loop
    continue when k !~* '(timeframe|timeline|how_?soon|when.*buy|planning|possession_timeline)';
    norm := regexp_replace(lower(coalesce(v, '')), '[_–—]', ' ', 'g');
    -- "Just exploring" is not a long timeline, it is the absence of one.
    if norm ~ '(explor|browsing|no rush|not sure|research)' then return 999; end if;
    hits := regexp_split_to_array(regexp_replace(norm, '[^0-9. ]', ' ', 'g'), '\s+');
    n := null;
    if hits is not null then
      for i in reverse array_length(hits, 1) .. 1 loop   -- last number = upper bound
        if hits[i] ~ '^[0-9]+(\.[0-9]+)?$' then n := hits[i]::numeric; exit; end if;
      end loop;
    end if;
    if n is not null then
      if norm ~ 'year'  then n := n * 12; end if;
      if norm ~ 'week'  then n := n / 4.0; end if;
      if norm ~ '\mday' then n := n / 30.0; end if;
      return n;
    end if;
  end loop;
  return null;
end $fn$;

-- ── Hot / Warm / Cold ───────────────────────────────────────────────────────
-- Hot   = buying within 3 months AND 5cr+
-- Cold  = just exploring, OR under 3cr, OR we know nothing about them yet
-- Warm  = everything in between
-- A manual override always wins, and keeps winning: once Manish has judged a
-- lead himself we stop second-guessing him on the next form sync.
create or replace function public.lead_temperature(attrs jsonb, override text)
returns text language sql immutable parallel safe as $fn$
  select case
    when override is not null then override
    else (
      select case
        when b is null and t is null then 'cold'
        when t >= 900 or b < 3       then 'cold'
        when t <= 3  and b >= 5      then 'hot'
        else 'warm'
      end
      from (select public.lead_budget_cr(attrs) as b,
                   public.lead_timeline_months(attrs) as t) q
    )
  end
$fn$;

-- ── Columns ─────────────────────────────────────────────────────────────────
alter table public.contacts
  add column if not exists pipeline             text not null default 'lead',
  add column if not exists temperature_override text,
  add column if not exists deal_value_cr        numeric,
  add column if not exists deal_value_is_manual boolean not null default false,
  add column if not exists pipeline_moved_at    timestamptz;

alter table public.contacts drop constraint if exists contacts_pipeline_check;
alter table public.contacts add  constraint contacts_pipeline_check
  check (pipeline in ('lead', 'deal'));

alter table public.contacts drop constraint if exists contacts_temperature_override_check;
alter table public.contacts add  constraint contacts_temperature_override_check
  check (temperature_override is null or temperature_override in ('hot', 'warm', 'cold'));

-- Effective tag, always in sync with the answers. Generated rather than
-- trigger-set so it can never drift from `attributes`, and so the board can
-- sort and filter on it without a join.
alter table public.contacts
  add column if not exists temperature text
  generated always as (public.lead_temperature(attributes, temperature_override)) stored;

alter table public.app_settings add column if not exists deal_stages jsonb;

-- ── Stage lists ─────────────────────────────────────────────────────────────
update public.app_settings set
  pipeline_stages = '["New","Attempted","Contacted","Follow Up","Qualified","Junk"]'::jsonb,
  deal_stages     = '["Visit Scheduled","Visited","Offer Made","Negotiation","Booked","Lost"]'::jsonb;

-- Safety net for legacy stage names. Every live contact is currently 'New', so
-- this is belt-and-braces rather than a real remap.
update public.contacts set lead_status = 'Contacted'       where lead_status in ('Prospecting', 'Warm');
update public.contacts set lead_status = 'Visit Scheduled' where lead_status = 'Visits';
update public.contacts set lead_status = 'Booked'          where lead_status in ('Closed', 'Won');
update public.contacts set lead_status = 'Follow Up'       where lead_status = 'Hot';
update public.contacts set lead_status = 'New'             where lead_status = 'Cool';
update public.contacts set lead_status = 'New'
  where lead_status is null
     or lead_status not in ('New','Attempted','Contacted','Follow Up','Qualified','Junk',
                            'Visit Scheduled','Visited','Offer Made','Negotiation','Booked','Lost');

-- ── Deal value ──────────────────────────────────────────────────────────────
-- ONE value per lead, never a sum. A lead chasing five ₹18cr flats is an ₹18cr
-- deal, not ₹90cr, because they will buy one of them. Take the largest single
-- property they are still live on; fall back to their stated budget floor.
create or replace function public.contact_auto_deal_value(p_contact uuid, p_attrs jsonb)
returns numeric language sql stable parallel safe as $fn$
  select coalesce(
    (select max(coalesce(p.price_min_cr, p.price_max_cr))
       from public.lead_properties lp
       join public.properties p on p.id = lp.property_id
      where lp.contact_id = p_contact
        and lp.status is distinct from 'rejected'),
    public.lead_budget_cr(p_attrs)
  )
$fn$;

-- ── Keep pipeline + deal value honest on every write ────────────────────────
create or replace function public.contacts_sync_pipeline_fields()
returns trigger language plpgsql as $fn$
declare
  deal_list text[];
begin
  select coalesce(array(select jsonb_array_elements_text(s.deal_stages)), '{}')
    into deal_list from public.app_settings s limit 1;
  if deal_list is null or cardinality(deal_list) = 0 then
    deal_list := array['Visit Scheduled','Visited','Offer Made','Negotiation','Booked','Lost'];
  end if;

  -- `lead_status` is authoritative. Anything that only moves the stage — a
  -- kanban drag, an automation, the AI qualifier — still lands in the right
  -- pipeline without knowing the two boards exist.
  new.pipeline := case when new.lead_status = any(deal_list) then 'deal' else 'lead' end;

  if tg_op = 'UPDATE' and new.pipeline is distinct from old.pipeline then
    new.pipeline_moved_at := now();
  elsif tg_op = 'INSERT' and new.pipeline = 'deal' then
    new.pipeline_moved_at := now();
  end if;

  if not new.deal_value_is_manual then
    new.deal_value_cr := public.contact_auto_deal_value(new.id, new.attributes);
  end if;

  return new;
end $fn$;

drop trigger if exists contacts_sync_pipeline_fields on public.contacts;
create trigger contacts_sync_pipeline_fields
  before insert or update on public.contacts
  for each row execute function public.contacts_sync_pipeline_fields();

-- Tagging or untagging a property changes the deal value. Touch the contact and
-- let the BEFORE trigger above do the actual work, so the rule lives in one place.
create or replace function public.lead_properties_touch_contact()
returns trigger language plpgsql as $fn$
declare cid uuid := coalesce(new.contact_id, old.contact_id);
begin
  if cid is not null then
    update public.contacts set updated_at = now()
     where id = cid and deal_value_is_manual = false;
  end if;
  return null;
end $fn$;

drop trigger if exists lead_properties_touch_contact on public.lead_properties;
create trigger lead_properties_touch_contact
  after insert or update or delete on public.lead_properties
  for each row execute function public.lead_properties_touch_contact();

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists contacts_pipeline_stage_idx on public.contacts (pipeline, lead_status);
create index if not exists contacts_temperature_idx    on public.contacts (temperature);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- No-op UPDATE so every existing row runs through the trigger once.
update public.contacts set updated_at = updated_at;

-- Attribute engine-sent messages to their flow, for per-flow analytics.
alter table public.messages add column if not exists flow_id uuid references public.flows(id) on delete set null;
create index if not exists messages_flow_idx on public.messages (flow_id);

-- Per-flow metrics: times triggered (runs), messages sent, failures, est. cost.
-- Cost in paise (₹1 = 100p) using WhatsApp India per-message rates by template
-- category; free-form text sends are treated as free (service window).
create or replace function public.flow_metrics()
returns table (flow_id uuid, triggered int, sent int, failed int, cost_paise numeric)
language sql security definer set search_path = public as $$
  with runs as (
    select flow_id, count(*)::int as triggered from flow_runs group by flow_id
  ),
  msgs as (
    select m.flow_id,
      count(*) filter (where m.direction = 'out' and coalesce(m.status,'') <> 'failed')::int as sent,
      count(*) filter (where m.status = 'failed')::int as failed,
      sum(case
        when m.type <> 'template' then 0
        when lower(coalesce(t.category,'')) = 'marketing' then 78.46
        when lower(coalesce(t.category,'')) = 'authentication' then 14.28
        when lower(coalesce(t.category,'')) = 'utility' then 11.50
        else 0 end) as cost_paise
    from messages m
    left join templates t on t.name = m.template_name
    where m.flow_id is not null
    group by m.flow_id
  )
  select f.id, coalesce(r.triggered,0), coalesce(mg.sent,0), coalesce(mg.failed,0), coalesce(mg.cost_paise,0)
  from flows f
  left join runs r on r.flow_id = f.id
  left join msgs mg on mg.flow_id = f.id;
$$;
grant execute on function public.flow_metrics() to authenticated;

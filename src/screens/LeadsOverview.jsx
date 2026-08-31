import { useState, useEffect, useMemo } from 'react';
import { getLeadsOverview, LEAD_SOURCES_META } from '../liveData';
import { useIsMobile } from '../useIsMobile';
import { IconSearch, IconRefresh } from '../icons';
import TemperatureTag from '../components/TemperatureTag';
import { leadChip, formatCr } from '../pipeline';

// Brand palette (matches the rest of the app).
const FOREST = 'var(--brand-primary)';

// Every source the deriver can return, coloured by family: campaign purple,
// Instagram pink, WhatsApp-ad green, lead form blue, everything else muted.
const SOURCE_BADGE = LEAD_SOURCES_META;
// TYPE badge: Qualified green, Intake gray, NotQualified amber, Junk red.
const TYPE_BADGE = {
  Qualified:    { label: 'Qualified',      bg: '#E4F5E9', fg: '#1E7D3E' },
  Intake:       { label: 'Intake',         bg: 'rgba(27,76,94,.08)', fg: 'rgba(27,76,94,.6)' },
  NotQualified: { label: 'Not Qualified',  bg: '#FFF1DC', fg: '#B6743A' },
  Junk:         { label: 'Junk',           bg: '#FDECEA', fg: '#C7503B' },
};

const FILTERS = [
  { key: 'all',          label: 'All' },
  { key: 'campaign_csv', label: 'Campaign · CSV' },
  { key: 'campaign',     label: 'Campaign' },
  { key: 'instagram',    label: 'Instagram' },
  { key: 'ctwa',         label: 'WhatsApp Ad' },
  { key: 'instant_form', label: 'Instant Form' },
  { key: 'manual',       label: 'By hand' },
  { key: 'unknown',      label: 'Unknown' },
];

function Badge({ map, k }) {
  const b = map[k] || { label: k || '-', bg: 'rgba(27,76,94,.07)', fg: 'rgba(27,76,94,.55)' };
  return (
    <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: b.bg, color: b.fg, whiteSpace: 'nowrap' }}>
      {b.label}
    </span>
  );
}

export default function LeadsOverview() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  const load = () => { setRows(null); getLeadsOverview().then(setRows); };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    if (!rows) return [];
    const query = q.trim().toLowerCase();
    return rows.filter(r => {
      if (filter !== 'all' && r.source !== filter) return false;
      if (query && !(`${r.name} ${r.phone} ${r.temperature} ${r.lead_status} ${r.sourceLabel} ${r.sourceDetail}`.toLowerCase().includes(query))) return false;
      return true;
    });
  }, [rows, filter, q]);

  const counts = useMemo(() => {
    const c = { all: rows?.length || 0 };
    FILTERS.forEach(f => { if (f.key !== 'all') c[f.key] = 0; });
    (rows || []).forEach(r => { if (c[r.source] !== undefined) c[r.source]++; });
    return c;
  }, [rows]);

  const cols = `2.2fr 1.1fr 1.5fr 1.1fr 1.1fr .9fr`;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--app-bg)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '16px 12px 32px' : '26px 28px 40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: 'rgba(27,76,94,.45)' }}>READ-ONLY</div>
            <h1 style={{ margin: '5px 0 0', fontSize: isMobile ? 20 : 22, fontWeight: 800, color: FOREST }}>Leads Overview</h1>
            <div style={{ fontSize: 13, color: 'rgba(27,76,94,.55)', marginTop: 3 }}>Every lead and exactly where it came from.</div>
          </div>
          <button onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid rgba(27,76,94,.18)', color: FOREST, fontSize: 13, fontWeight: 700, padding: '9px 14px', borderRadius: 10, cursor: 'pointer' }}>
            <IconRefresh size={14} /> Refresh
          </button>
        </div>

        {/* Filter pills + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FILTERS.map(f => {
              const on = filter === f.key;
              const n = counts[f.key] ?? 0;
              return (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{ fontSize: 12.5, fontWeight: 700, padding: '9px 13px', minHeight: 38, borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', border: '1px solid ' + (on ? FOREST : 'rgba(27,76,94,.16)'), background: on ? FOREST : '#fff', color: on ? '#fff' : (n === 0 ? 'rgba(27,76,94,.38)' : 'rgba(27,76,94,.7)') }}>
                  {f.label} <span style={{ opacity: 0.6 }}>· {n}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(27,76,94,.16)', borderRadius: 10, padding: '8px 13px', background: '#fff', flex: 1, minWidth: 200 }}>
            <span style={{ width: 14, height: 14, color: 'rgba(27,76,94,.4)', display: 'flex' }}><IconSearch size={14} /></span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or phone…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: FOREST, width: '100%', fontFamily: 'inherit' }} />
          </div>
        </div>

        {/* Phone: cards. Six columns inside 375px forces a 680px table and
            clips the lead name to a few characters. */}
        {isMobile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {rows === null ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(27,76,94,.5)', fontSize: 14 }}>Loading leads…</div>
            ) : visible.length === 0 ? (
              <div style={{ background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 14, padding: '26px 16px', textAlign: 'center', color: 'rgba(27,76,94,.55)', fontSize: 14 }}>No leads match this view.</div>
            ) : visible.map(r => (
              <div key={r.id} style={{ background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 14, padding: '13px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: FOREST, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'rgba(27,76,94,.45)' }}>{r.phone}</span>
                  </span>
                  <TemperatureTag temp={r.temperature} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                  <span style={leadChip(r.lead_status)}>{r.lead_status}</span>
                  <Badge map={TYPE_BADGE} k={r.type} />
                  <Badge map={SOURCE_BADGE} k={r.source} />
                  {r.pipeline === 'deal' && r.deal_value_cr
                    ? <span style={{ fontSize: 12.5, fontWeight: 800, color: FOREST }}>{formatCr(r.deal_value_cr)}</span>
                    : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 9, paddingTop: 9, borderTop: '1px solid rgba(27,76,94,.07)' }}>
                  <span style={{ fontSize: 11.5, color: 'rgba(27,76,94,.4)', flexShrink: 0 }}>{r.campaign ? 'Campaign' : 'Came from'}</span>
                  <span style={{ fontSize: 12, color: 'rgba(27,76,94,.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={r.sourceDetail}>{r.sourceDetail}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'rgba(27,76,94,.45)', whiteSpace: 'nowrap', flexShrink: 0 }}>{r.created_rel}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Desktop table */}
        <div style={{ display: isMobile ? 'none' : 'block', background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 680 }}>
              {/* Header row */}
              <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '12px 18px', background: '#F6FAF6', borderBottom: '1px solid rgba(27,76,94,.08)', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: 'rgba(27,76,94,.5)' }}>
                <span>LEAD</span><span>SOURCE</span><span>CAMPAIGN / DETAIL</span><span>TYPE</span><span>STAGE</span><span>CREATED</span>
              </div>

              {rows === null ? (
                <div style={{ padding: '48px 0', textAlign: 'center', color: 'rgba(27,76,94,.5)', fontSize: 14 }}>Loading leads…</div>
              ) : visible.length === 0 ? (
                <div style={{ padding: '48px 20px', textAlign: 'center', color: 'rgba(27,76,94,.55)', fontSize: 14 }}>No leads match this view.</div>
              ) : visible.map(r => (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '13px 18px', alignItems: 'center', borderBottom: '1px solid rgba(27,76,94,.05)', fontSize: 12.5, color: 'rgba(27,76,94,.7)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ fontWeight: 700, color: FOREST, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      <TemperatureTag temp={r.temperature} />
                    </div>
                    <div style={{ fontSize: 11.5, color: 'rgba(27,76,94,.45)' }}>{r.phone}</div>
                  </div>
                  <div><Badge map={SOURCE_BADGE} k={r.source} /></div>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.sourceDetail}>{r.sourceDetail}</div>
                  <div><Badge map={TYPE_BADGE} k={r.type} /></div>
                  <div style={{ minWidth: 0 }}>
                    <span style={leadChip(r.lead_status)}>{r.lead_status}</span>
                    {r.pipeline === 'deal' && r.deal_value_cr
                      ? <div style={{ fontSize: 11, fontWeight: 800, color: FOREST, marginTop: 3 }}>{formatCr(r.deal_value_cr)}</div>
                      : null}
                  </div>
                  <div style={{ color: 'rgba(27,76,94,.55)', whiteSpace: 'nowrap' }}>{r.created_rel}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {rows !== null && (
          <div style={{ fontSize: 12, color: 'rgba(27,76,94,.45)', marginTop: 10 }}>
            Showing {visible.length} of {rows.length} leads · newest first
          </div>
        )}
      </div>
    </div>
  );
}

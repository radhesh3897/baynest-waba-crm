import { useState, useEffect, useRef } from 'react';
import { IconCalendar, IconChevDown } from '../icons';

// ── Date helpers (all in the browser's local time, like Ads Manager) ──────────
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays  = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth   = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const startOfWeek  = (d) => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return x; };

// The same preset set Meta Ads Manager offers, plus longer marketing windows.
export const PRESETS = [
  { key: 'today',      label: 'Today',          range: () => { const t = new Date(); return [t, t]; } },
  { key: 'yesterday',  label: 'Yesterday',      range: () => { const y = addDays(new Date(), -1); return [y, y]; } },
  { key: 'last7',      label: 'Last 7 days',    range: () => [addDays(new Date(), -7), addDays(new Date(), -1)] },
  { key: 'last14',     label: 'Last 14 days',   range: () => [addDays(new Date(), -14), addDays(new Date(), -1)] },
  { key: 'last28',     label: 'Last 28 days',   range: () => [addDays(new Date(), -28), addDays(new Date(), -1)] },
  { key: 'last30',     label: 'Last 30 days',   range: () => [addDays(new Date(), -30), addDays(new Date(), -1)] },
  { key: 'thisWeek',   label: 'This week',      range: () => [startOfWeek(new Date()), new Date()] },
  { key: 'lastWeek',   label: 'Last week',      range: () => { const s = addDays(startOfWeek(new Date()), -7); return [s, addDays(s, 6)]; } },
  { key: 'thisMonth',  label: 'This month',     range: () => [startOfMonth(new Date()), new Date()] },
  { key: 'lastMonth',  label: 'Last month',     range: () => { const d = new Date(); const s = new Date(d.getFullYear(), d.getMonth() - 1, 1); return [s, endOfMonth(s)]; } },
  { key: 'last3m',     label: 'Last 3 months',  range: () => [startOfMonth(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1)), new Date()] },
  { key: 'last6m',     label: 'Last 6 months',  range: () => [startOfMonth(new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1)), new Date()] },
  { key: 'last12m',    label: 'Last 12 months', range: () => [startOfMonth(new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1)), new Date()] },
  { key: 'maximum',    label: 'Maximum',        range: () => [new Date(2020, 0, 1), new Date()] },
];

const fmt = (s) => {
  const [y, m, d] = s.split('-');
  return `${d} ${new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short' })} ${y}`;
};

// value = { since, until, presetKey }
export default function DateRangePicker({ value, onChange, isMobile }) {
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState(value.since);
  const [until, setUntil] = useState(value.until);
  const box = useRef(null);

  useEffect(() => { setSince(value.since); setUntil(value.until); }, [value.since, value.until]);

  // Close on outside click — expected behaviour for a dropdown like this.
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const current = PRESETS.find(p => p.key === value.presetKey);
  const label = current ? current.label : `${fmt(value.since)} – ${fmt(value.until)}`;

  const apply = (p) => {
    const [s, u] = p.range();
    onChange({ since: ymd(s), until: ymd(u), presetKey: p.key });
    setOpen(false);
  };
  const applyCustom = () => {
    if (!since || !until) return;
    const [s, u] = since <= until ? [since, until] : [until, since];
    onChange({ since: s, until: u, presetKey: null });
    setOpen(false);
  };

  const input = { border: '1px solid rgba(27,76,94,.18)', borderRadius: 9, padding: '8px 10px', fontSize: 13, color: 'var(--brand-primary)', fontFamily: 'inherit', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid rgba(27,76,94,.18)', borderRadius: 10, padding: '9px 13px', fontSize: 13, fontWeight: 600, color: 'var(--brand-primary)', cursor: 'pointer', maxWidth: isMobile ? '100%' : 'none' }}>
        <span style={{ display: 'flex', color: 'rgba(27,76,94,.5)' }}><IconCalendar size={15} /></span>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <span style={{ display: 'flex', color: 'rgba(27,76,94,.45)' }}><IconChevDown size={13} /></span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: isMobile ? 'auto' : 0, left: isMobile ? 0 : 'auto',
          zIndex: 60, background: '#fff', border: '1px solid rgba(27,76,94,.14)', borderRadius: 14,
          boxShadow: '0 16px 44px rgba(18,54,66,.18)', padding: 10,
          width: isMobile ? 'min(320px, 92vw)' : 480, display: isMobile ? 'block' : 'flex', gap: 10,
        }}>
          {/* Presets */}
          <div style={{ flex: '0 0 190px', maxHeight: 300, overflowY: 'auto' }}>
            {PRESETS.map(p => {
              const on = p.key === value.presetKey;
              return (
                <button key={p.key} onClick={() => apply(p)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                    background: on ? 'var(--brand-primary)' : 'transparent', color: on ? '#fff' : 'var(--brand-primary)',
                    fontSize: 13, fontWeight: on ? 700 : 500, padding: '8px 11px', borderRadius: 8, marginBottom: 2 }}>
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Custom range */}
          <div style={{ flex: 1, borderLeft: isMobile ? 'none' : '1px solid rgba(27,76,94,.10)', paddingLeft: isMobile ? 0 : 12, marginTop: isMobile ? 10 : 0, paddingTop: isMobile ? 10 : 0, borderTop: isMobile ? '1px solid rgba(27,76,94,.10)' : 'none' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)', textTransform: 'uppercase', marginBottom: 8 }}>Custom range</div>
            <label style={{ fontSize: 11.5, color: 'rgba(27,76,94,.6)', fontWeight: 600 }}>From</label>
            <input type="date" value={since} max={until || undefined} onChange={e => setSince(e.target.value)} style={{ ...input, margin: '4px 0 10px' }} />
            <label style={{ fontSize: 11.5, color: 'rgba(27,76,94,.6)', fontWeight: 600 }}>To</label>
            <input type="date" value={until} min={since || undefined} onChange={e => setUntil(e.target.value)} style={{ ...input, margin: '4px 0 12px' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setOpen(false)} style={{ flex: 1, border: '1px solid rgba(27,76,94,.18)', background: 'transparent', color: 'var(--brand-primary)', borderRadius: 9, fontSize: 12.5, fontWeight: 700, padding: '9px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={applyCustom} style={{ flex: 1, border: 'none', background: 'var(--brand-primary)', color: '#fff', borderRadius: 9, fontSize: 12.5, fontWeight: 800, padding: '9px', cursor: 'pointer' }}>Update</button>
            </div>
            <div style={{ fontSize: 10.5, color: 'rgba(27,76,94,.4)', marginTop: 9, lineHeight: 1.45 }}>
              Up to ~2 months shows day by day; longer ranges roll up by month.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

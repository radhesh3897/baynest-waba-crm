import { useState, useEffect, useMemo } from 'react';
import { getProperties } from '../liveData';
import { IconSearch } from '../icons';

// Build status → chip style. RTMI (ready) reads calm green, UC amber-gold, Launch teal.
const STATUS_STYLE = {
  RTMI:   { bg: 'rgba(115,167,111,.22)', fg: '#3B6B45', label: 'Ready to move' },
  UC:     { bg: 'rgba(192,138,69,.18)',  fg: '#8A5E22', label: 'Under construction' },
  Launch: { bg: 'rgba(27,76,94,.12)',    fg: 'var(--brand-primary)', label: 'New launch' },
};
function statusChip(status) {
  const s = STATUS_STYLE[status] || { bg: 'rgba(27,76,94,.08)', fg: 'var(--brand-primary)', label: status };
  return { chip: { background: s.bg, color: s.fg, fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }, label: status };
}

const TH = { textAlign: 'left', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)', padding: '0 14px 10px', textTransform: 'uppercase', whiteSpace: 'nowrap' };
const TD = { fontSize: 13, color: 'var(--brand-primary)', padding: '13px 14px', borderTop: '1px solid rgba(27,76,94,.07)', verticalAlign: 'middle' };

export default function Properties() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [area, setArea] = useState('All');
  const [status, setStatus] = useState('All');

  useEffect(() => { getProperties().then(p => { setRows(p); setLoading(false); }); }, []);

  const areas = useMemo(() => ['All', ...Array.from(new Set(rows.map(r => r.area).filter(Boolean))).sort()], [rows]);
  const statuses = ['All', 'RTMI', 'UC', 'Launch'];

  const filtered = rows.filter(r => {
    if (area !== 'All' && r.area !== area) return false;
    if (status !== 'All' && r.status !== status) return false;
    if (q) {
      const hay = `${r.name} ${r.area} ${r.view} ${r.positioning} ${r.configuration}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const pill = (active) => ({
    padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: 'none',
    background: active ? 'var(--brand-primary)' : 'rgba(27,76,94,.06)',
    color: active ? '#fff' : 'rgba(27,76,94,.7)',
  });

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '26px 30px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--brand-primary)', letterSpacing: '-.01em' }}>Properties</h1>
        <span style={{ fontSize: 14, color: 'rgba(27,76,94,.45)', fontWeight: 600 }}>{filtered.length} projects</span>
      </div>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(27,76,94,.55)' }}>The master catalogue. Tag any lead with the projects they are interested in from their chat.</p>

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 18 }}>
        <div style={{ position: 'relative', flex: '0 0 260px' }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'rgba(27,76,94,.4)' }}><IconSearch size={15} /></span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search projects…"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.16)', borderRadius: 10, padding: '9px 12px 9px 32px', fontSize: 13, color: 'var(--brand-primary)', outline: 'none', background: '#fff', fontFamily: 'inherit' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {statuses.map(s => <button key={s} style={pill(status === s)} onClick={() => setStatus(s)}>{s === 'All' ? 'All status' : s}</button>)}
        </div>
        <select value={area} onChange={e => setArea(e.target.value)}
          style={{ border: '1px solid rgba(27,76,94,.16)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: 'var(--brand-primary)', background: '#fff', fontFamily: 'inherit', cursor: 'pointer' }}>
          {areas.map(a => <option key={a} value={a}>{a === 'All' ? 'All areas' : a}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(27,76,94,.08)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ ...TH, paddingTop: 16 }}>Project</th>
                <th style={{ ...TH, paddingTop: 16 }}>Area</th>
                <th style={{ ...TH, paddingTop: 16 }}>Status</th>
                <th style={{ ...TH, paddingTop: 16 }}>Configuration</th>
                <th style={{ ...TH, paddingTop: 16 }}>Carpet (sq ft)</th>
                <th style={{ ...TH, paddingTop: 16 }}>Starting Price</th>
                <th style={{ ...TH, paddingTop: 16 }}>View</th>
                <th style={{ ...TH, paddingTop: 16 }}>Positioning</th>
                <th style={{ ...TH, paddingTop: 16 }}>Possession</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={{ ...TD, color: 'rgba(27,76,94,.5)' }} colSpan={9}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td style={{ ...TD, color: 'rgba(27,76,94,.5)' }} colSpan={9}>No projects match.</td></tr>
              ) : filtered.map(r => {
                const s = statusChip(r.status);
                return (
                  <tr key={r.id}>
                    <td style={{ ...TD, fontWeight: 700 }}>{r.name}</td>
                    <td style={TD}>{r.area}</td>
                    <td style={TD}><span style={s.chip}>{s.label}</span></td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.configuration}</td>
                    <td style={{ ...TD, whiteSpace: 'nowrap', color: 'rgba(27,76,94,.75)' }}>{r.carpet_size}</td>
                    <td style={{ ...TD, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.starting_price}</td>
                    <td style={{ ...TD, color: 'rgba(27,76,94,.75)' }}>{r.view}</td>
                    <td style={{ ...TD, color: 'rgba(27,76,94,.75)' }}>{r.positioning}</td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.possession}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

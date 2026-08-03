import { useState, useEffect, useMemo } from 'react';
import { getProperties, getPropertyStats } from '../liveData';
import { IconSearch, IconPlus } from '../icons';
import PropertyDetail from '../components/PropertyDetail';

const STATUS_STYLE = {
  RTMI:   { bg: 'rgba(115,167,111,.22)', fg: '#3B6B45' },
  UC:     { bg: 'rgba(192,138,69,.18)',  fg: '#8A5E22' },
  Launch: { bg: 'rgba(27,76,94,.12)',    fg: 'var(--brand-primary)' },
};
function statusChip(status) {
  const s = STATUS_STYLE[status] || { bg: 'rgba(27,76,94,.08)', fg: 'var(--brand-primary)' };
  return { background: s.bg, color: s.fg, fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' };
}

const TH = { textAlign: 'left', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)', padding: '16px 14px 10px', textTransform: 'uppercase', whiteSpace: 'nowrap' };
const TD = { fontSize: 13, color: 'var(--brand-primary)', padding: '13px 14px', borderTop: '1px solid rgba(27,76,94,.07)', verticalAlign: 'middle' };
// Count "pill" for the Interested / Rejected columns.
function countCell(n, tone) {
  const fg = tone === 'accept' ? '#3B6B45' : 'rgba(199,80,59,.9)';
  const bg = tone === 'accept' ? 'rgba(115,167,111,.16)' : 'rgba(199,80,59,.09)';
  if (!n) return <span style={{ color: 'rgba(27,76,94,.28)' }}>0</span>;
  return <span style={{ background: bg, color: fg, fontWeight: 800, fontSize: 12.5, padding: '2px 10px', borderRadius: 999, minWidth: 22, display: 'inline-block', textAlign: 'center' }}>{n}</span>;
}

export default function Properties() {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ byProp: {} });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [area, setArea] = useState('All');
  const [status, setStatus] = useState('All');
  const [editing, setEditing] = useState(undefined); // undefined=closed, null=new, obj=edit

  async function load() {
    const [p, s] = await Promise.all([getProperties(), getPropertyStats()]);
    setRows(p); setStats(s); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const areas = useMemo(() => ['All', ...Array.from(new Set(rows.map(r => r.area).filter(Boolean))).sort()], [rows]);
  const statuses = ['All', 'RTMI', 'UC', 'Launch'];

  const filtered = rows.filter(r => {
    if (area !== 'All' && r.area !== area) return false;
    if (status !== 'All' && r.status !== status) return false;
    if (q && !`${r.name} ${r.area} ${r.developer} ${r.view} ${r.positioning} ${r.configuration}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const pill = (active) => ({ padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: 'none', background: active ? 'var(--brand-primary)' : 'rgba(27,76,94,.06)', color: active ? '#fff' : 'rgba(27,76,94,.7)' });

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '26px 30px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--brand-primary)', letterSpacing: '-.01em' }}>Properties</h1>
          <span style={{ fontSize: 14, color: 'rgba(27,76,94,.45)', fontWeight: 600 }}>{filtered.length} projects</span>
        </div>
        <button onClick={() => setEditing(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'var(--brand-primary)', color: '#fff', borderRadius: 11, fontSize: 13, fontWeight: 700, padding: '10px 16px', cursor: 'pointer' }}>
          <IconPlus size={14} /> Add property
        </button>
      </div>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(27,76,94,.55)' }}>The master catalogue. Interested and Rejected show how each project performs across all leads. Click a project to edit it or tag leads.</p>

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
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

      {/* Table — per-project analysis: Interested vs Rejected */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(27,76,94,.08)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={TH}>Project</th>
                <th style={TH}>Area</th>
                <th style={TH}>Status</th>
                <th style={TH}>Configuration</th>
                <th style={TH}>Starting Price</th>
                <th style={{ ...TH, textAlign: 'center' }}>Interested</th>
                <th style={{ ...TH, textAlign: 'center' }}>Rejected</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={{ ...TD, color: 'rgba(27,76,94,.5)' }} colSpan={7}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td style={{ ...TD, color: 'rgba(27,76,94,.5)' }} colSpan={7}>No projects match.</td></tr>
              ) : filtered.map(r => {
                const ip = stats.byProp[r.id] || { interested: 0, rejected: 0 };
                return (
                  <tr key={r.id}>
                    <td style={TD}>
                      <button onClick={() => setEditing(r)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)' }}>{r.name}</button>
                      {r.developer && <div style={{ fontSize: 11, color: 'rgba(27,76,94,.45)', marginTop: 1 }}>{r.developer}</div>}
                    </td>
                    <td style={TD}>{r.area}</td>
                    <td style={TD}><span style={statusChip(r.status)}>{r.status}</span></td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.configuration}</td>
                    <td style={{ ...TD, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.starting_price}</td>
                    <td style={{ ...TD, textAlign: 'center' }}>{countCell(ip.interested, 'accept')}</td>
                    <td style={{ ...TD, textAlign: 'center' }}>{countCell(ip.rejected, 'reject')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && (
        <PropertyDetail property={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); setLoading(true); load(); }} onTagsChanged={load} />
      )}
    </div>
  );
}

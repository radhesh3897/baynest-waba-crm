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

function StatTile({ label, value, tone }) {
  const fg = tone === 'accept' ? '#3B6B45' : tone === 'reject' ? 'rgba(199,80,59,.9)' : tone === 'gold' ? '#8A5E22' : 'var(--brand-primary)';
  return (
    <div style={{ flex: 1, minWidth: 130, background: '#fff', border: '1px solid rgba(27,76,94,.08)', borderRadius: 14, padding: '15px 17px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: fg, marginTop: 5, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

export default function Properties() {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ accepted: 0, rejected: 0, leads: 0, byProp: {} });
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
      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'rgba(27,76,94,.55)' }}>The master catalogue. Click any project to edit it or see who is interested.</p>

      {/* Analytics on top — accepted vs rejected across every lead tag */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatTile label="Projects" value={rows.length} />
        <StatTile label="Interested (accepted)" value={stats.accepted} tone="accept" />
        <StatTile label="Rejected" value={stats.rejected} tone="reject" />
        <StatTile label="Leads engaged" value={stats.leads} tone="gold" />
      </div>

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

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(27,76,94,.08)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
            <thead>
              <tr>
                {['Project', 'Area', 'Status', 'Configuration', 'Carpet (sq ft)', 'Starting Price', 'Interest', 'Possession'].map(h => <th key={h} style={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={{ ...TD, color: 'rgba(27,76,94,.5)' }} colSpan={8}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td style={{ ...TD, color: 'rgba(27,76,94,.5)' }} colSpan={8}>No projects match.</td></tr>
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
                    <td style={{ ...TD, whiteSpace: 'nowrap', color: 'rgba(27,76,94,.75)' }}>{r.carpet_size}</td>
                    <td style={{ ...TD, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.starting_price}</td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                      {ip.interested > 0 && <span style={{ color: '#3B6B45', fontWeight: 700 }}>{ip.interested} interested</span>}
                      {ip.interested > 0 && ip.rejected > 0 && <span style={{ color: 'rgba(27,76,94,.3)' }}> · </span>}
                      {ip.rejected > 0 && <span style={{ color: 'rgba(199,80,59,.8)', fontWeight: 600 }}>{ip.rejected} rej</span>}
                      {ip.interested === 0 && ip.rejected === 0 && <span style={{ color: 'rgba(27,76,94,.3)' }}>—</span>}
                    </td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.possession}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && (
        <PropertyDetail property={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); setLoading(true); load(); }} />
      )}
    </div>
  );
}

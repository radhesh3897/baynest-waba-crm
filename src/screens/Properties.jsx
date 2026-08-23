import { useState, useEffect, useMemo } from 'react';
import { getProperties, getPropertyStats } from '../liveData';
import { IconSearch, IconPlus } from '../icons';
import { useIsMobile } from '../useIsMobile';
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

// Developer monogram. Real logos win when developer_logo_url is set; until then
// a branded monogram reads as deliberate, where a scraped 16px favicon would
// just look broken. Colour is derived from the name so a developer always gets
// the same badge, and the ramp is muted to match the rest of the UI.
const BADGE_TONES = [
  { bg: 'rgba(27,76,94,.10)',   fg: '#1B4C5E' },
  { bg: 'rgba(192,138,69,.16)', fg: '#8A5E22' },
  { bg: 'rgba(115,167,111,.18)',fg: '#3B6B45' },
  { bg: 'rgba(62,107,120,.14)', fg: '#2C6579' },
  { bg: 'rgba(199,80,59,.12)',  fg: '#9A3F2C' },
];
function badgeTone(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return BADGE_TONES[h % BADGE_TONES.length];
}
// "Lodha Group" -> LG, "Kalpataru" -> KA. Skips filler words so the monogram
// reflects the brand rather than its suffix.
function monogram(name) {
  const skip = new Set(['group', 'realty', 'developers', 'properties', 'ltd', 'limited', 'the', 'and', '&']);
  const words = String(name || '').split(/[\s.]+/).filter(w => w && !skip.has(w.toLowerCase()));
  if (words.length === 0) return (name || '?').trim().slice(0, 2).toUpperCase();
  // A short single word is already the mark ("L&T"); truncating it to two
  // characters would produce "L&".
  if (words.length === 1) return words[0].slice(0, words[0].length <= 3 ? 3 : 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Short status codes read as jargon to a buyer; spell them out on the card.
const STATUS_LONG = { RTMI: 'Ready to move in', UC: 'Under construction', Launch: 'New launch' };
function friendlyStatus(s) { return STATUS_LONG[s] || s || ''; }

// "Sale Range" line. Prefer an explicit min–max in Cr; fall back to the free-text
// starting price so a half-filled project still shows something sensible.
function priceRange(r) {
  const min = Number(r.price_min_cr) || 0;
  const max = Number(r.price_max_cr) || 0;
  if (min && max && max > min) return `₹ ${min} Cr - ${max} Cr`;
  if (r.starting_price) return String(r.starting_price);
  if (min) return `₹ ${min} Cr+`;
  return '';
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

// Image-forward project card (Manish's reference): hero photo, developer badge,
// price overlay, then the project facts. Used on mobile; also available as a
// grid card if we ever want it on desktop.
function PropertyCard({ r, ip, onClick }) {
  const price = priceRange(r);
  const possession = r.possession ? `Possession: ${r.possession}` : '';
  const statusLine = [friendlyStatus(r.status), possession].filter(Boolean).join('  |  ');
  const initials = monogram(r.developer || r.name);
  const tone = badgeTone(r.developer || r.name);

  return (
    <button onClick={onClick}
      style={{ display: 'block', width: '100%', textAlign: 'left', background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 16, overflow: 'hidden', marginBottom: 14, cursor: 'pointer', padding: 0, boxShadow: '0 2px 10px rgba(14,58,53,.05)' }}>
      {/* Hero */}
      <div style={{ position: 'relative', height: 190, background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-muted))' }}>
        {r.image_url
          ? <img src={r.image_url} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.5)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"/></svg>
            </div>}

        {/* Developer badge */}
        <div style={{ position: 'absolute', top: 12, left: 12, width: 40, height: 40, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {r.developer_logo_url
            ? <img src={r.developer_logo_url} alt={r.developer}
                // A logo is a wordmark or a mark; contain keeps it whole where
                // cover would crop it. Padding stops it touching the rim.
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 5, boxSizing: 'border-box' }} />
            : <div title={r.developer || ''} style={{ width: '100%', height: '100%', background: tone.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.02em', color: tone.fg }}>{initials}</span>
              </div>}
        </div>

        {/* Status chip */}
        <span style={{ position: 'absolute', top: 12, right: 12, ...statusChip(r.status), boxShadow: '0 2px 8px rgba(0,0,0,.14)' }}>{r.status}</span>

        {/* Price overlay */}
        {price && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '30px 14px 12px', background: 'linear-gradient(to top, rgba(0,0,0,.62), rgba(0,0,0,0))' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(255,255,255,.8)', textTransform: 'uppercase' }}>Sale range</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{price}</div>
            {r.price_per_sqft && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.85)', marginTop: 1 }}>{r.price_per_sqft}</div>}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '13px 15px 14px' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--brand-primary)', letterSpacing: '-.01em' }}>{r.name}</div>
        {r.area && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'rgba(27,76,94,.6)', marginTop: 3 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            {r.area}
          </div>
        )}
        {statusLine && <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.7)', fontWeight: 600, marginTop: 8 }}>{statusLine}</div>}

        {r.project_size && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', color: 'rgba(27,76,94,.42)', textTransform: 'uppercase' }}>Project size</div>
            <div style={{ fontSize: 13, color: 'var(--brand-primary)', fontWeight: 600, marginTop: 2 }}>{r.project_size}</div>
          </div>
        )}

        {(r.configuration || r.carpet_size) && (
          <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid rgba(27,76,94,.08)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', color: 'rgba(27,76,94,.42)', textTransform: 'uppercase' }}>Configurations</div>
            <div style={{ fontSize: 13, color: 'var(--brand-primary)', fontWeight: 600, marginTop: 2 }}>
              {[r.configuration, r.carpet_size ? `${r.carpet_size} sq ft` : ''].filter(Boolean).join('  •  ')}
            </div>
          </div>
        )}

        {/* Lead traction, kept from the analytics view */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13 }}>
          <span style={{ fontSize: 11.5, color: 'rgba(27,76,94,.5)', fontWeight: 600 }}>Leads:</span>
          {countCell(ip.interested, 'accept')}<span style={{ fontSize: 11, color: 'rgba(27,76,94,.45)' }}>interested</span>
          {countCell(ip.rejected, 'reject')}<span style={{ fontSize: 11, color: 'rgba(27,76,94,.45)' }}>rejected</span>
        </div>
      </div>
    </button>
  );
}

export default function Properties() {
  const isMobile = useIsMobile();
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
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: isMobile ? '18px 14px 32px' : '26px 30px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? 21 : 26, fontWeight: 800, color: 'var(--brand-primary)', letterSpacing: '-.01em' }}>Properties</h1>
          <span style={{ fontSize: isMobile ? 12.5 : 14, color: 'rgba(27,76,94,.45)', fontWeight: 600, whiteSpace: 'nowrap' }}>{filtered.length} projects</span>
        </div>
        <button onClick={() => setEditing(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'var(--brand-primary)', color: '#fff', borderRadius: 11, fontSize: 13, fontWeight: 700, padding: isMobile ? '9px 13px' : '10px 16px', cursor: 'pointer', flexShrink: 0 }}>
          <IconPlus size={14} />{isMobile ? 'Add' : 'Add property'}
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

      {/* Mobile: cards. A 7-column table is unusable on a phone. */}
      {isMobile ? (
        <div>
          {loading ? (
            <div style={{ fontSize: 13, color: 'rgba(27,76,94,.5)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ fontSize: 13, color: 'rgba(27,76,94,.5)' }}>No projects match.</div>
          ) : filtered.map(r => (
            <PropertyCard key={r.id} r={r} ip={stats.byProp[r.id] || { interested: 0, rejected: 0 }} onClick={() => setEditing(r)} />
          ))}
        </div>
      ) : (
      /* Desktop table — per-project analysis: Interested vs Rejected */
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
      )}

      {editing !== undefined && (
        <PropertyDetail property={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); setLoading(true); load(); }} onTagsChanged={load} />
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useIsMobile } from '../useIsMobile';
import { IconChart, IconSearch, IconRefresh } from '../icons';
import { getTrackingLeads, setLeadQualification, uploadTrackingLeads, removeTrackingLead, QUALIFICATIONS, QUALIFICATION_LABELS } from '../liveData';

const FOREST = 'var(--brand-primary)';
const HIDE_ATTRS = new Set(['meta_lead_id', 'tags', 'source', 'form_id']);
const humanKey = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const humanVal = (v) => String(v).replace(/_/g, ' ');

const Q_STYLE = {
  Intake:       { bg: 'var(--app-bg)', fg: 'var(--brand-primary)', on: 'var(--brand-primary)' },
  Qualified:    { bg: '#EAF7EC', fg: '#2E7D44', on: '#3B6B45' },
  NotQualified: { bg: '#FFF1DC', fg: '#8A6420', on: '#B6743A' },
  Junk:         { bg: '#FDECEA', fg: '#C0392B', on: '#C7503B' },
};

// Minimal CSV parser (handles quoted fields + commas/newlines inside quotes).
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const LEAD_KEYS = ['lead_id', 'lead gen id', 'leadgen_id', 'lead_gen_id', 'leadid', 'id'];
const NAME_KEYS = ['name', 'full_name', 'full name', 'first_name', 'first name'];
const PHONE_KEYS = ['phone', 'phone_number', 'phone number', 'mobile'];
const EMAIL_KEYS = ['email', 'work_email', 'work email', 'work_email_address', 'email address'];

function csvToRows(text) {
  const grid = parseCSV(text);
  if (grid.length < 2) return [];
  const headers = grid[0].map((h) => h.trim().toLowerCase());
  const pick = (obj, keys) => { for (const k of keys) { const i = headers.indexOf(k); if (i >= 0 && obj[i] != null && obj[i].trim() !== '') return obj[i].trim(); } return ''; };
  const out = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    const lead_id = pick(cells, LEAD_KEYS);
    if (!lead_id) continue; // must have a lead gen id
    const known = new Set([...LEAD_KEYS, ...NAME_KEYS, ...PHONE_KEYS, ...EMAIL_KEYS]);
    const attributes = {};
    headers.forEach((h, i) => { if (!known.has(h) && cells[i] && cells[i].trim() !== '') attributes[h.replace(/\s+/g, '_')] = cells[i].trim(); });
    out.push({ lead_id, name: pick(cells, NAME_KEYS) || null, phone: pick(cells, PHONE_KEYS) || null, email: pick(cells, EMAIL_KEYS) || null, attributes });
  }
  return out;
}

export default function Tracking() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [busy, setBusy] = useState({});     // key -> true while sending
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(() => new Set()); // expanded row keys
  const fileRef = useRef(null);
  const toggle = (k) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const load = () => getTrackingLeads().then(setRows);
  useEffect(() => { load(); }, []);

  async function qualify(row, qual) {
    setBusy((b) => ({ ...b, [row.key]: true })); setMsg('');
    const res = await setLeadQualification(row.source, row.id, qual);
    setBusy((b) => ({ ...b, [row.key]: false }));
    if (res && res.ok) {
      setRows((rs) => rs.map((r) => r.key === row.key ? { ...r, qualification: qual, capiStatus: res.status } : r));
      setMsg(`✅ ${row.name}: ${QUALIFICATION_LABELS[qual]} sent to Meta (matched by ${res.matched_by}).`);
    } else {
      setMsg(`⚠️ ${row.name}: ${res?.error || res?.status || 'failed to send'}`);
    }
  }

  async function remove(row) {
    if (!window.confirm(`Remove "${row.name}" from Tracking? This deletes the lead${row.source === 'contact' ? ' and its chat history' : ''}.`)) return;
    setBusy((b) => ({ ...b, [row.key]: true }));
    const res = await removeTrackingLead(row.source, row.id);
    setBusy((b) => ({ ...b, [row.key]: false }));
    if (res && res.ok) {
      setRows((rs) => rs.filter((r) => r.key !== row.key));
      setMsg(`Removed ${row.name}.`);
    } else {
      setMsg(`⚠️ Could not remove ${row.name}: ${res?.error || 'error'}`);
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setMsg('Reading CSV…');
    const text = await file.text();
    const parsed = csvToRows(text);
    if (!parsed.length) { setMsg('No rows with a lead-gen id found. Make sure a column is named lead_id / “Lead gen id”.'); return; }
    const res = await uploadTrackingLeads(parsed);
    setMsg(res.ok ? `✅ Imported ${res.count} lead(s) from CSV.` : `⚠️ ${res.error}`);
    if (res.ok) load();
  }

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'All' && r.qualification !== filter) return false;
      if (!needle) return true;
      return [r.name, r.phone, r.email, r.leadId].some((v) => (v || '').toLowerCase().includes(needle));
    });
  }, [rows, q, filter]);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--app-bg)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '16px 12px 32px' : '26px 28px 40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: '#EAF6E4', color: '#3B6B45', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 9 }}><IconChart size={20} /></div>
            <div>
              <div style={{ fontSize: isMobile ? 19 : 22, fontWeight: 800, color: FOREST }}>Tracking</div>
              <div style={{ fontSize: 13, color: 'rgba(27,76,94,.55)' }}>Qualify leads → sends the event to Meta (CRM pixel)</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => fileRef.current?.click()} style={{ background: '#fff', border: '1px solid rgba(27,76,94,.18)', color: FOREST, fontSize: 13, fontWeight: 700, padding: '9px 14px', borderRadius: 10, cursor: 'pointer' }}>⬆ Import CSV</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
            <motion.button whileTap={{ scale: 0.96 }} onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: FOREST, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, padding: '9px 14px', borderRadius: 10, cursor: 'pointer' }}><IconRefresh size={14} /> Refresh</motion.button>
          </div>
        </div>

        {/* Search + filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid rgba(27,76,94,.14)', borderRadius: 10, padding: '9px 12px', flex: 1, minWidth: 180 }}>
            <IconSearch size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email, lead id…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: FOREST, width: '100%', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['All', ...QUALIFICATIONS].map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                fontSize: 12, fontWeight: 700, padding: '8px 12px', borderRadius: 999, cursor: 'pointer',
                border: filter === f ? '1px solid ' + FOREST : '1px solid rgba(27,76,94,.14)',
                background: filter === f ? FOREST : '#fff', color: filter === f ? '#fff' : 'rgba(27,76,94,.7)',
              }}>{f === 'All' ? 'All' : QUALIFICATION_LABELS[f]}</button>
            ))}
          </div>
        </div>

        {msg && <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.75)', background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 10, padding: '10px 13px', marginBottom: 12, lineHeight: 1.5 }}>{msg}</div>}

        {/* List */}
        {!rows ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'rgba(27,76,94,.5)', fontSize: 14 }}>Loading leads…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'rgba(27,76,94,.5)', fontSize: 14 }}>No leads match.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((r) => {
              const isOpen = open.has(r.key);
              const qs = r.qualification ? Q_STYLE[r.qualification] : null;
              return (
                <div key={r.key} style={{ background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 14, overflow: 'hidden' }}>
                  {/* Header row: name (click to expand) + status dropdown */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '12px 13px' : '13px 18px' }}>
                    <button onClick={() => toggle(r.key)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'inherit' }}>
                      <span style={{ color: 'rgba(27,76,94,.4)', fontSize: 10, flexShrink: 0, transition: 'transform .15s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                      <span title={r.qualification ? QUALIFICATION_LABELS[r.qualification] : 'Not tagged'} style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: qs ? qs.on : 'rgba(27,76,94,.16)' }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: FOREST, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                        <span style={{ fontSize: 11, color: 'rgba(27,76,94,.45)' }}>{r.origin} · {new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      </span>
                    </button>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {busy[r.key] && <span style={{ fontSize: 10.5, color: 'rgba(27,76,94,.5)', marginRight: 6 }}>…</span>}
                      <select
                        value={r.qualification || ''}
                        disabled={busy[r.key]}
                        onChange={(e) => e.target.value && qualify(r, e.target.value)}
                        style={{
                          appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', fontFamily: 'inherit',
                          fontSize: 12.5, fontWeight: 700, cursor: busy[r.key] ? 'default' : 'pointer',
                          padding: '8px 28px 8px 11px', borderRadius: 9, minWidth: 128, outline: 'none', opacity: busy[r.key] ? 0.6 : 1,
                          border: '1px solid ' + (r.qualification ? Q_STYLE[r.qualification].on : 'rgba(27,76,94,.2)'),
                          background: r.qualification ? Q_STYLE[r.qualification].bg : '#fff',
                          color: r.qualification ? Q_STYLE[r.qualification].on : 'rgba(27,76,94,.6)',
                        }}>
                        <option value="" disabled>Set status…</option>
                        {QUALIFICATIONS.map((qq) => <option key={qq} value={qq}>{QUALIFICATION_LABELS[qq]}</option>)}
                      </select>
                      <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 9, color: r.qualification ? Q_STYLE[r.qualification].on : 'rgba(27,76,94,.5)' }}>▼</span>
                    </div>
                  </div>

                  {/* Details (revealed on click) */}
                  {isOpen && (
                    <div style={{ padding: isMobile ? '0 13px 13px 33px' : '0 18px 15px 40px', borderTop: '1px solid rgba(27,76,94,.06)' }}>
                      <div style={{ fontSize: 12, color: 'rgba(27,76,94,.6)', margin: '11px 0 8px' }}>
                        {r.phone || '-'}{r.email ? ' · ' + r.email : ''}{r.leadId ? ' · lead ' + r.leadId : ' · (no lead id)'}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {Object.entries(r.attributes).filter(([k]) => !HIDE_ATTRS.has(k)).map(([k, v]) => (
                          <span key={k} style={{ fontSize: 11, background: '#F2F8F2', color: 'var(--brand-muted)', borderRadius: 7, padding: '3px 8px' }}>
                            <b style={{ fontWeight: 700 }}>{humanKey(k)}:</b> {humanVal(v)}
                          </span>
                        ))}
                      </div>
                      {r.capiStatus && <div style={{ fontSize: 11, marginTop: 8, color: r.capiStatus.startsWith('sent') ? '#2E7D44' : '#C0392B' }}>Meta: {r.capiStatus}</div>}
                      <button onClick={() => remove(r)} disabled={busy[r.key]} style={{ marginTop: 12, background: '#FDECEA', border: '1px solid rgba(199,80,59,.25)', color: '#C7503B', fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, cursor: busy[r.key] ? 'default' : 'pointer', opacity: busy[r.key] ? 0.6 : 1 }}>Remove lead</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import {
  getProperties, getLeadProperties, tagLeadProperty, setLeadPropertyStatus,
  removeLeadProperty, matchProperties, PROPERTY_STATUSES, REJECTION_REASONS,
} from '../liveData';
import { IconPlus, IconX, IconSearch } from '../icons';

// Per-status chip colour. Rejected reads muted/struck; booked reads success.
const ST = {
  interested:  { bg: 'rgba(27,76,94,.09)',   fg: 'var(--brand-primary)' },
  pitched:     { bg: 'rgba(192,138,69,.16)',  fg: '#8A5E22' },
  visited:     { bg: 'rgba(192,138,69,.22)',  fg: '#7A4E18' },
  negotiating: { bg: 'rgba(27,76,94,.16)',    fg: 'var(--brand-primary)' },
  booked:      { bg: 'rgba(115,167,111,.28)', fg: '#3B6B45' },
  rejected:    { bg: 'rgba(199,80,59,.10)',   fg: 'rgba(199,80,59,.85)' },
};

export default function LeadProperties({ contactId, lead }) {
  const [tags, setTags] = useState([]);
  const [master, setMaster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [rejectingId, setRejectingId] = useState(null);

  async function load() {
    setLoading(true);
    const [t, m] = await Promise.all([getLeadProperties(contactId), getProperties()]);
    setTags(t); setMaster(m); setLoading(false);
  }
  useEffect(() => { if (contactId) load(); /* eslint-disable-next-line */ }, [contactId]);

  const taggedIds = useMemo(() => new Set(tags.map(t => t.property_id)), [tags]);

  // Suggested matches from the lead's budget/area/config, minus already-tagged.
  const suggestions = useMemo(() => {
    if (!lead) return [];
    const budgetCr = parseFloat(String(lead.attributes?.budget || lead.attributes?.budget_cr || '').replace(/[^\d.]/g, '')) || null;
    return matchProperties(master, { budgetCr, area: lead.attributes?.area, bhk: lead.attributes?.bhk })
      .filter(p => !taggedIds.has(p.id)).slice(0, 4);
  }, [master, lead, taggedIds]);

  const available = master.filter(p => !taggedIds.has(p.id) &&
    (!q || `${p.name} ${p.area}`.toLowerCase().includes(q.toLowerCase())));

  const active = tags.filter(t => t.status !== 'rejected');
  const rejected = tags.filter(t => t.status === 'rejected');

  async function add(propertyId) {
    const p = master.find(m => m.id === propertyId);
    setTags(ts => [...ts, { id: `tmp-${propertyId}`, property_id: propertyId, status: 'interested', property: p }]);
    setAdding(false); setQ('');
    await tagLeadProperty(contactId, propertyId);
    load();
  }
  async function changeStatus(tag, status, reason = null) {
    setTags(ts => ts.map(t => t.id === tag.id ? { ...t, status, rejection_reason: reason } : t));
    setRejectingId(null);
    await setLeadPropertyStatus(tag.id, status, reason);
  }
  async function remove(tag) {
    if (!window.confirm(`Remove ${tag.property?.name} from ${lead?.firstName || 'this lead'}?`)) return;
    setTags(ts => ts.filter(t => t.id !== tag.id));
    await removeLeadProperty(tag.id);
  }

  const row = (t) => {
    const c = ST[t.status] || ST.interested;
    const rej = t.status === 'rejected';
    return (
      <div key={t.id} style={{ border: '1px solid rgba(27,76,94,.10)', borderRadius: 11, padding: '9px 11px', marginBottom: 7, background: rej ? 'rgba(199,80,59,.03)' : '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-primary)', textDecoration: rej ? 'line-through' : 'none', opacity: rej ? .7 : 1 }}>{t.property?.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(27,76,94,.5)', marginTop: 1 }}>{t.property?.area} · {t.property?.configuration} · {t.property?.starting_price}</div>
          </div>
          <button onClick={() => remove(t)} title="Remove" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(27,76,94,.3)', padding: 2, lineHeight: 0 }}><IconX size={13} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <select value={t.status} onChange={e => e.target.value === 'rejected' ? setRejectingId(t.id) : changeStatus(t, e.target.value)}
            style={{ ...c, border: 'none', borderRadius: 999, fontSize: 11, fontWeight: 800, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', appearance: 'none', textTransform: 'capitalize' }}>
            {PROPERTY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {rej && t.rejection_reason && <span style={{ fontSize: 10.5, color: 'rgba(199,80,59,.7)', fontWeight: 600 }}>reason: {t.rejection_reason}</span>}
        </div>
        {rejectingId === t.id && (
          <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {REJECTION_REASONS.map(r => (
              <button key={r} onClick={() => changeStatus(t, 'rejected', r)}
                style={{ border: '1px solid rgba(199,80,59,.25)', background: 'rgba(199,80,59,.05)', color: 'rgba(199,80,59,.9)', borderRadius: 999, fontSize: 10.5, fontWeight: 700, padding: '3px 9px', cursor: 'pointer', textTransform: 'capitalize' }}>{r}</button>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!contactId) return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: 'rgba(27,76,94,.5)', textTransform: 'uppercase' }}>
          Interested Properties {tags.length > 0 && `(${active.length})`}
        </span>
        <button onClick={() => setAdding(a => !a)} style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'var(--brand-primary)', color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '4px 10px', cursor: 'pointer' }}>
          <IconPlus size={12} /> Tag
        </button>
      </div>

      {adding && (
        <div style={{ border: '1px solid rgba(27,76,94,.14)', borderRadius: 11, padding: 9, marginBottom: 9, background: 'var(--brand-tint-soft)' }}>
          {suggestions.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(192,138,69,.9)', letterSpacing: '.06em', marginBottom: 5 }}>SUGGESTED FOR THIS LEAD</div>
              {suggestions.map(p => (
                <button key={p.id} onClick={() => add(p.id)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: '#fff', borderRadius: 8, padding: '7px 9px', marginBottom: 4, cursor: 'pointer', fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{p.name}</span>
                  <span style={{ color: 'rgba(27,76,94,.5)' }}> · {p.area} · {p.starting_price}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'rgba(27,76,94,.4)' }}><IconSearch size={13} /></span>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search all projects…"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.16)', borderRadius: 8, padding: '7px 10px 7px 28px', fontSize: 12, outline: 'none', fontFamily: 'inherit', background: '#fff' }} />
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 6 }}>
            {available.map(p => (
              <button key={p.id} onClick={() => add(p.id)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: 8, padding: '7px 9px', cursor: 'pointer', fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{p.name}</span>
                <span style={{ color: 'rgba(27,76,94,.5)' }}> · {p.area} · {p.starting_price}</span>
              </button>
            ))}
            {available.length === 0 && <div style={{ fontSize: 11.5, color: 'rgba(27,76,94,.45)', padding: '6px 9px' }}>Nothing left to tag.</div>}
          </div>
        </div>
      )}

      {loading ? <div style={{ fontSize: 12, color: 'rgba(27,76,94,.45)' }}>Loading…</div> : (
        <>
          {active.map(row)}
          {active.length === 0 && !adding && <div style={{ fontSize: 12, color: 'rgba(27,76,94,.45)', marginBottom: 8 }}>No properties tagged yet.</div>}
          {rejected.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(199,80,59,.65)', margin: '4px 0 6px' }}>REJECTED ({rejected.length})</div>
              {rejected.map(row)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { PROPERTY_FIELDS, getPropertyLeads, createProperty, updateProperty, deleteProperty } from '../liveData';
import { IconX } from '../icons';

const LEAD_ST = {
  interested:  { bg: 'rgba(27,76,94,.09)', fg: 'var(--brand-primary)' },
  pitched:     { bg: 'rgba(192,138,69,.16)', fg: '#8A5E22' },
  visited:     { bg: 'rgba(192,138,69,.22)', fg: '#7A4E18' },
  negotiating: { bg: 'rgba(27,76,94,.16)', fg: 'var(--brand-primary)' },
  booked:      { bg: 'rgba(115,167,111,.28)', fg: '#3B6B45' },
  rejected:    { bg: 'rgba(199,80,59,.10)', fg: 'rgba(199,80,59,.85)' },
};

// property = existing row (edit) OR null (create).
export default function PropertyDetail({ property, onClose, onSaved }) {
  const isNew = !property?.id;
  const [form, setForm] = useState(() => {
    const base = {};
    PROPERTY_FIELDS.forEach(f => { base[f.key] = property?.[f.key] ?? ''; });
    return base;
  });
  const [leads, setLeads] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (property?.id) getPropertyLeads(property.id).then(setLeads);
  }, [property?.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name?.trim()) { setErr('Project name is required.'); return; }
    setSaving(true); setErr('');
    const res = isNew ? await createProperty(form) : await updateProperty(property.id, form);
    setSaving(false);
    if (res.ok) onSaved(); else setErr(res.error || 'Could not save.');
  }
  async function remove() {
    if (!window.confirm(`Archive “${property.name}”? It will be removed from the catalogue (existing lead tags are kept).`)) return;
    setSaving(true);
    const res = await deleteProperty(property.id);
    setSaving(false);
    if (res.ok) onSaved(); else setErr(res.error || 'Could not archive.');
  }

  const input = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.16)', borderRadius: 9, padding: '9px 11px', fontSize: 13, color: 'var(--brand-primary)', outline: 'none', fontFamily: 'inherit', background: '#fff' };
  const label = { display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(27,76,94,.5)', marginBottom: 5, textTransform: 'uppercase' };

  const active = leads.filter(l => l.status !== 'rejected');
  const rejected = leads.filter(l => l.status === 'rejected');

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(18,54,66,.45)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 96vw)', height: '100%', background: 'var(--app-bg)', boxShadow: '-16px 0 48px rgba(18,54,66,.28)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(27,76,94,.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(27,76,94,.45)' }}>{isNew ? 'ADD PROPERTY' : 'EDIT PROPERTY'}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--brand-primary)', marginTop: 2 }}>{form.name || 'New project'}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(27,76,94,.06)', cursor: 'pointer', color: 'rgba(27,76,94,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconX size={15} /></button>
        </div>

        {/* Scroll body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
            {PROPERTY_FIELDS.map(f => (
              <div key={f.key} style={{ gridColumn: f.textarea ? '1 / -1' : 'auto' }}>
                <label style={label}>{f.label}{f.required && <span style={{ color: 'rgba(199,80,59,.8)' }}> *</span>}</label>
                {f.options ? (
                  <select value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                    <option value="">—</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.textarea ? (
                  <textarea value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} rows={3} style={{ ...input, resize: 'vertical' }} />
                ) : (
                  <input type={f.type === 'number' ? 'number' : 'text'} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} style={input} />
                )}
              </div>
            ))}
          </div>

          {err && <div style={{ marginTop: 14, background: 'rgba(199,80,59,.08)', color: '#C7503B', fontSize: 12.5, fontWeight: 600, padding: '9px 12px', borderRadius: 9 }}>{err}</div>}

          {/* Tagged leads — the "who's interested" view */}
          {!isNew && (
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)', marginBottom: 10, textTransform: 'uppercase' }}>
                Tagged leads · {active.length} interested{rejected.length ? ` · ${rejected.length} rejected` : ''}
              </div>
              {leads.length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.45)' }}>No leads tagged to this project yet.</div>}
              {leads.map(l => {
                const c = LEAD_ST[l.status] || LEAD_ST.interested;
                return (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 11px', border: '1px solid rgba(27,76,94,.1)', borderRadius: 10, marginBottom: 6, background: '#fff' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-primary)' }}>{l.contact?.profile_name || l.contact?.wa_id || 'Lead'}</span>
                    <span style={{ ...c, fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, textTransform: 'capitalize' }}>
                      {l.status}{l.status === 'rejected' && l.rejection_reason ? ` · ${l.rejection_reason}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(27,76,94,.1)', display: 'flex', alignItems: 'center', gap: 10, background: '#fff' }}>
          {!isNew && <button onClick={remove} disabled={saving} style={{ border: '1px solid rgba(199,80,59,.3)', background: 'transparent', color: 'rgba(199,80,59,.9)', borderRadius: 10, fontSize: 13, fontWeight: 700, padding: '10px 14px', cursor: 'pointer' }}>Archive</button>}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} disabled={saving} style={{ border: '1px solid rgba(27,76,94,.18)', background: 'transparent', color: 'var(--brand-primary)', borderRadius: 10, fontSize: 13, fontWeight: 700, padding: '10px 16px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ border: 'none', background: 'var(--brand-primary)', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 800, padding: '10px 20px', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : isNew ? 'Add property' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}

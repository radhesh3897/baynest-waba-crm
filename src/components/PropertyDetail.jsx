import { useState, useEffect } from 'react';
import {
  PROPERTY_FIELDS, PROPERTY_STATUSES, REJECTION_REASONS,
  getPropertyLeads, createProperty, updateProperty, deleteProperty,
  getPeopleLive, tagLeadProperty, setLeadPropertyStatus, removeLeadProperty, uploadPropertyImage,
} from '../liveData';
import { IconX, IconPlus, IconSearch, IconClip } from '../icons';
import { useIsMobile } from '../useIsMobile';

const LEAD_ST = {
  interested:  { bg: 'rgba(27,76,94,.09)', fg: 'var(--brand-primary)' },
  pitched:     { bg: 'rgba(192,138,69,.16)', fg: '#8A5E22' },
  visited:     { bg: 'rgba(192,138,69,.22)', fg: '#7A4E18' },
  negotiating: { bg: 'rgba(27,76,94,.16)', fg: 'var(--brand-primary)' },
  booked:      { bg: 'rgba(115,167,111,.28)', fg: '#3B6B45' },
  rejected:    { bg: 'rgba(199,80,59,.10)', fg: 'rgba(199,80,59,.85)' },
};

// property = existing row (edit) OR null (create). onTagsChanged refreshes the parent counts.
export default function PropertyDetail({ property, onClose, onSaved, onTagsChanged }) {
  const isMobile = useIsMobile();
  const isNew = !property?.id;
  const [form, setForm] = useState(() => {
    const base = {};
    PROPERTY_FIELDS.forEach(f => { base[f.key] = property?.[f.key] ?? ''; });
    return base;
  });
  const [leads, setLeads] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [picking, setPicking] = useState(false);
  const [leadQ, setLeadQ] = useState('');
  const [rejectingId, setRejectingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function reloadLeads() { if (property?.id) setLeads(await getPropertyLeads(property.id)); }
  useEffect(() => {
    if (property?.id) { reloadLeads(); getPeopleLive().then(setAllLeads); }
    // eslint-disable-next-line
  }, [property?.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const notify = () => onTagsChanged && onTagsChanged();

  async function save() {
    if (!form.name?.trim()) { setErr('Project name is required.'); return; }
    setSaving(true); setErr('');
    const res = isNew ? await createProperty(form) : await updateProperty(property.id, form);
    setSaving(false);
    if (res.ok) onSaved(); else setErr(res.error || 'Could not save.');
  }
  async function remove() {
    if (!window.confirm(`Archive “${property.name}”? It leaves the catalogue (lead tags are kept).`)) return;
    setSaving(true);
    const res = await deleteProperty(property.id);
    setSaving(false);
    if (res.ok) onSaved(); else setErr(res.error || 'Could not archive.');
  }

  // ── Image upload ──
  const [uploading, setUploading] = useState('');
  const [uploadErr, setUploadErr] = useState({});
  async function handleUpload(key, file) {
    if (!file) return;
    setUploading(key); setUploadErr(e => ({ ...e, [key]: '' }));
    const res = await uploadPropertyImage(file);
    setUploading('');
    if (!res.ok) { setUploadErr(e => ({ ...e, [key]: res.error })); return; }
    set(key, res.url);
  }

  // ── Property-side tagging ──
  async function tagLead(contactId) {
    setPicking(false); setLeadQ('');
    await tagLeadProperty(contactId, property.id);
    await reloadLeads(); notify();
  }
  async function changeLeadStatus(l, status, reason = null) {
    setRejectingId(null);
    setLeads(ls => ls.map(x => x.id === l.id ? { ...x, status, rejection_reason: reason } : x));
    await setLeadPropertyStatus(l.id, status, reason); notify();
  }
  async function untag(l) {
    setLeads(ls => ls.filter(x => x.id !== l.id));
    await removeLeadProperty(l.id); notify();
  }

  const input = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.16)', borderRadius: 9, padding: '9px 11px', fontSize: 13, color: 'var(--brand-primary)', outline: 'none', fontFamily: 'inherit', background: '#fff' };
  const label = { display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(27,76,94,.5)', marginBottom: 5, textTransform: 'uppercase' };

  const taggedIds = new Set(leads.map(l => l.contact?.id).filter(Boolean));
  const pickable = allLeads.filter(p => !taggedIds.has(p.id) &&
    (!leadQ || `${p.profile_name} ${p.phone}`.toLowerCase().includes(leadQ.toLowerCase())));
  const active = leads.filter(l => l.status !== 'rejected');
  const rejected = leads.filter(l => l.status === 'rejected');

  const leadRow = (l) => {
    const c = LEAD_ST[l.status] || LEAD_ST.interested;
    return (
      <div key={l.id} style={{ padding: '9px 11px', border: '1px solid rgba(27,76,94,.1)', borderRadius: 10, marginBottom: 6, background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--brand-primary)' }}>{l.contact?.profile_name || l.contact?.wa_id || 'Lead'}</span>
          <select value={l.status} onChange={e => e.target.value === 'rejected' ? setRejectingId(l.id) : changeLeadStatus(l, e.target.value)}
            style={{ ...c, border: 'none', borderRadius: 999, fontSize: 11, fontWeight: 800, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', appearance: 'none', textTransform: 'capitalize' }}>
            {PROPERTY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => untag(l)} title="Remove tag" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(27,76,94,.3)', padding: 2, lineHeight: 0 }}><IconX size={13} /></button>
        </div>
        {l.status === 'rejected' && l.rejection_reason && <div style={{ fontSize: 10.5, color: 'rgba(199,80,59,.7)', fontWeight: 600, marginTop: 5 }}>reason: {l.rejection_reason}</div>}
        {rejectingId === l.id && (
          <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {REJECTION_REASONS.map(r => (
              <button key={r} onClick={() => changeLeadStatus(l, 'rejected', r)}
                style={{ border: '1px solid rgba(199,80,59,.25)', background: 'rgba(199,80,59,.05)', color: 'rgba(199,80,59,.9)', borderRadius: 999, fontSize: 10.5, fontWeight: 700, padding: '3px 9px', cursor: 'pointer', textTransform: 'capitalize' }}>{r}</button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(18,54,66,.45)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: isMobile ? '100%' : 'min(560px, 96vw)', height: '100%', background: 'var(--app-bg)', boxShadow: '-16px 0 48px rgba(18,54,66,.28)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(27,76,94,.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(27,76,94,.45)' }}>{isNew ? 'ADD PROPERTY' : 'EDIT PROPERTY'}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--brand-primary)', marginTop: 2 }}>{form.name || 'New project'}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(27,76,94,.06)', cursor: 'pointer', color: 'rgba(27,76,94,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconX size={15} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 14px' : '20px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 13 }}>
            {PROPERTY_FIELDS.map(f => (
              <div key={f.key} style={{ gridColumn: f.textarea ? '1 / -1' : 'auto' }}>
                <label style={label}>{f.label}{f.required && <span style={{ color: 'rgba(199,80,59,.8)' }}> *</span>}</label>
                {f.options ? (
                  <select value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                    <option value="">-</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.image ? (
                  // Pasting a URL is fine if you already host the image, but
                  // nobody has one to hand, so upload is the primary action and
                  // the URL box stays for anything already online.
                  <div>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'stretch' }}>
                      <input type="text" value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}
                        placeholder="Paste an image URL, or upload" style={{ ...input, flex: 1, minWidth: 0 }} />
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(27,76,94,.16)', borderRadius: 9, padding: '0 12px', fontSize: 12.5, fontWeight: 700, color: 'var(--brand-primary)', cursor: uploading === f.key ? 'default' : 'pointer', background: '#fff', whiteSpace: 'nowrap', opacity: uploading === f.key ? .6 : 1 }}>
                        <IconClip size={14} />
                        {uploading === f.key ? 'Uploading…' : 'Upload'}
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          disabled={uploading === f.key}
                          onChange={e => handleUpload(f.key, e.target.files?.[0])} />
                      </label>
                    </div>
                    {form[f.key] && (
                      <img src={form[f.key]} alt="" onError={e => { e.currentTarget.style.display = 'none'; }}
                        style={{ marginTop: 8, width: '100%', maxHeight: 130, objectFit: 'cover', borderRadius: 9, border: '1px solid rgba(27,76,94,.12)', display: 'block' }} />
                    )}
                    {uploadErr[f.key] && <div style={{ marginTop: 6, fontSize: 11.5, color: '#C7503B', fontWeight: 600 }}>{uploadErr[f.key]}</div>}
                  </div>
                ) : f.textarea ? (
                  <textarea value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} rows={3} style={{ ...input, resize: 'vertical' }} />
                ) : (
                  <input type={f.type === 'number' ? 'number' : 'text'} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} style={input} />
                )}
              </div>
            ))}
          </div>

          {err && <div style={{ marginTop: 14, background: 'rgba(199,80,59,.08)', color: '#C7503B', fontSize: 12.5, fontWeight: 600, padding: '9px 12px', borderRadius: 9 }}>{err}</div>}

          {/* Tagged leads — with a property-side Tag action */}
          {!isNew && (
            <div style={{ marginTop: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)', textTransform: 'uppercase' }}>
                  Tagged leads · {active.length} interested{rejected.length ? ` · ${rejected.length} rejected` : ''}
                </span>
                <button onClick={() => setPicking(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'var(--brand-primary)', color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '4px 11px', cursor: 'pointer' }}>
                  <IconPlus size={12} /> Tag a lead
                </button>
              </div>

              {picking && (
                <div style={{ border: '1px solid rgba(27,76,94,.14)', borderRadius: 11, padding: 9, marginBottom: 10, background: 'var(--brand-tint-soft)' }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'rgba(27,76,94,.4)' }}><IconSearch size={13} /></span>
                    <input autoFocus value={leadQ} onChange={e => setLeadQ(e.target.value)} placeholder="Search leads…"
                      style={{ ...input, padding: '7px 10px 7px 28px', fontSize: 12 }} />
                  </div>
                  <div style={{ maxHeight: 190, overflowY: 'auto', marginTop: 6 }}>
                    {pickable.map(p => (
                      <button key={p.id} onClick={() => tagLead(p.id)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: 8, padding: '7px 9px', cursor: 'pointer', fontSize: 12.5 }}>
                        <span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{p.profile_name}</span>
                        <span style={{ color: 'rgba(27,76,94,.5)' }}> · {p.phone}</span>
                      </button>
                    ))}
                    {pickable.length === 0 && <div style={{ fontSize: 11.5, color: 'rgba(27,76,94,.45)', padding: '6px 9px' }}>No more leads to tag.</div>}
                  </div>
                </div>
              )}

              {leads.length === 0 && !picking && <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.45)' }}>No leads tagged to this project yet.</div>}
              {active.map(leadRow)}
              {rejected.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(199,80,59,.65)', margin: '8px 0 6px' }}>REJECTED ({rejected.length})</div>
                  {rejected.map(leadRow)}
                </>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(27,76,94,.1)', display: 'flex', alignItems: 'center', gap: 10, background: '#fff' }}>
          {!isNew && <button onClick={remove} disabled={saving} style={{ border: '1px solid rgba(199,80,59,.3)', background: 'transparent', color: 'rgba(199,80,59,.9)', borderRadius: 10, fontSize: 13, fontWeight: 700, padding: '10px 14px', cursor: 'pointer' }}>Archive</button>}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} disabled={saving} style={{ border: '1px solid rgba(27,76,94,.18)', background: 'transparent', color: 'var(--brand-primary)', borderRadius: 10, fontSize: 13, fontWeight: 700, padding: '10px 16px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ border: 'none', background: 'var(--brand-primary)', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 800, padding: '10px 20px', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : isNew ? 'Add property' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}

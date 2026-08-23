import { useState, useEffect } from 'react';
import { getFormsLive, getPeopleLive, updateLeadStatusLive, addLeadLive, getPipelineStages } from '../liveData';
import { IconPlus, IconSearch, IconChevDown, IconX, IconMail, IconPhone, IconWhatsApp, IconZap, IconEdit } from '../icons';
import { useIsMobile } from '../useIsMobile';
import ContactNotes from '../components/ContactNotes';
import LeadCustomFields from '../components/LeadCustomFields';
import LeadAnswersEditable from '../components/LeadAnswersEditable';

// ── Pipeline stages ──────────────────────────────────────────────────────────
const STAGES = ['New', 'Prospecting', 'Visits', 'Negotiation', 'Closed', 'Lost'];

const LEAD_SOURCES = [
  { key: 'Meta Lead Ads', label: 'Meta Ads', icon: '📘' },
  { key: 'Google Ads',    label: 'Google Ads', icon: '🔍' },
  { key: 'Website',       label: 'Website', icon: '🌐' },
  { key: 'Referral',      label: 'Referral', icon: '🤝' },
  { key: 'WhatsApp',      label: 'WhatsApp', icon: '💬' },
  { key: 'Manual',        label: 'Manual', icon: '✍️' },
];

const STAGE_STYLE = {
  New:         { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'rgba(27,76,94,.25)', fg: 'var(--brand-primary)', count: 'rgba(27,76,94,.08)' },
  Prospecting: { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'rgba(27,76,94,.45)', fg: 'var(--brand-primary)', count: 'rgba(27,76,94,.08)' },
  Visits:      { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'var(--brand-accent-soft)', fg: 'var(--brand-primary)', count: 'rgba(192,138,69,.18)' },
  Negotiation: { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'var(--brand-primary)', fg: 'var(--brand-primary)', count: 'rgba(27,76,94,.13)' },
  Closed:      { col: 'var(--app-bg)', hd: '#E2EBE6', dot: '#3B6B45', fg: 'var(--brand-primary)', count: 'rgba(115,167,111,.20)' },
  Lost:        { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'rgba(27,76,94,.18)', fg: 'rgba(27,76,94,.5)', count: 'rgba(27,76,94,.06)' },
};

const LEAD_STATUS_STYLE = {
  New:         { bg: 'rgba(27,76,94,.07)', fg: 'var(--brand-primary)' },
  Prospecting: { bg: 'rgba(27,76,94,.13)', fg: 'var(--brand-primary)' },
  Visits:      { bg: 'rgba(192,138,69,.18)', fg: '#8A5E22' },
  Negotiation: { bg: 'var(--brand-primary)', fg: 'var(--app-bg)' },
  Closed:      { bg: 'rgba(115,167,111,.22)', fg: '#3B6B45' },
  Lost:        { bg: 'rgba(27,76,94,.05)', fg: 'rgba(27,76,94,.45)' },
};

function leadChip(status) {
  const c = LEAD_STATUS_STYLE[status] || { bg: 'rgba(27,76,94,.07)', fg: 'var(--brand-primary)' };
  return { display: 'inline-flex', alignItems: 'center', gap: 5, background: c.bg, color: c.fg, fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999 };
}
// Style for a stage column — falls back gracefully for custom stage names.
function stageStyle(stage) {
  return STAGE_STYLE[stage] || { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'rgba(27,76,94,.45)', fg: 'var(--brand-primary)', count: 'rgba(27,76,94,.10)' };
}

function scoreColor(score) {
  if (score >= 75) return 'var(--brand-accent-soft)';
  if (score >= 50) return 'var(--brand-primary)';
  return 'rgba(27,76,94,.4)';
}

// ── Contact detail pop-up (centered modal) ────────────────────────────────────
function ContactPanel({ contact, formDef, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(14,58,53,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="fade-up" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(480px,96vw)', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(14,58,53,.3)' }}>
        <div style={{ padding: '16px 20px 0', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#F2F6F3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.55)' }}>
            <IconX size={15} />
          </button>
        </div>
        <div style={{ padding: '4px 20px 18px', textAlign: 'center', borderBottom: '1px solid rgba(27,76,94,.08)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: contact.color || 'var(--brand-muted)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, margin: '0 auto 10px' }}>
            {contact.profile_name?.charAt(0)}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--brand-primary)' }}>{contact.profile_name}</div>
          <div style={{ fontSize: 12, color: 'rgba(27,76,94,.55)', marginTop: 2 }}>{contact.jobTitle !== '-' ? `${contact.jobTitle} · ` : ''}{contact.company !== '-' ? contact.company : ''}</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 13 }}>
            <a href={`https://wa.me/${String(contact.phone || '').replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" title="Open WhatsApp chat"
              style={{ width: 42, height: 42, borderRadius: 12, border: '1px solid rgba(46,158,79,.3)', background: '#EAF6E4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3B6B45', textDecoration: 'none' }}>
              <IconWhatsApp size={20} />
            </a>
          </div>
        </div>
        <div style={{ padding: '16px 20px 6px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: 'var(--brand-primary)', marginBottom: 10 }}>CONTACT DETAILS</div>
          {[
            { label: 'Phone',   value: contact.phone },
            { label: 'Email',   value: contact.email },
            { label: 'Source',  value: contact.source },
          ].map(f => (
            <FieldRow key={f.label} label={f.label} value={f.value} />
          ))}
        </div>
        <div style={{ padding: '8px 20px 24px' }}>
          <LeadAnswersEditable contactId={contact.id} attributes={contact.attributes} />
          {/* Same tags and custom fields the Inbox panel edits, so whatever the
              team captures mid-chat is here when the lead is opened from CRM. */}
          <div style={{ borderTop: '1px solid rgba(27,76,94,.08)', paddingTop: 16, marginTop: 4 }}>
            <LeadCustomFields contactId={contact.id} />
          </div>
          <div style={{ borderTop: '1px solid rgba(27,76,94,.08)', paddingTop: 16, marginTop: 16 }}>
            <ContactNotes contactId={contact.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, value }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(27,76,94,.45)', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(27,76,94,.13)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, color: 'var(--brand-primary)', fontWeight: 500 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '-'}</span>
        <span style={{ color: 'rgba(27,76,94,.3)', flexShrink: 0, marginLeft: 6, display: 'flex' }}><IconEdit size={12} /></span>
      </div>
    </div>
  );
}

// ── Kanban card ───────────────────────────────────────────────────────────────
function KanbanCard({ lead, formDef, onDragStart, onClick }) {
  const preview = (formDef?.cardFields || []).map(key => {
    const field = formDef.fields.find(f => f.key === key);
    const val = (lead.attributes || {})[key];
    return field && val ? { label: field.label, val } : null;
  }).filter(Boolean);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      style={{ background: '#fff', border: '1px solid rgba(27,76,94,.11)', borderRadius: 11, padding: '11px 12px', cursor: 'grab', boxShadow: '0 1px 3px rgba(14,58,53,.07)', marginBottom: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: lead.color || 'var(--brand-muted)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
          {lead.profile_name?.charAt(0)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.profile_name}</div>
          {lead.company !== '-' && <div style={{ fontSize: 10.5, color: 'rgba(27,76,94,.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company}</div>}
        </div>
      </div>
      {preview.map(p => (
        <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
          <span style={{ color: 'rgba(27,76,94,.5)', fontWeight: 600 }}>{p.label}</span>
          <span style={{ color: 'var(--brand-primary)', fontWeight: 700 }}>{p.val}</span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, paddingTop: 9, borderTop: '1px solid rgba(27,76,94,.07)' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(27,76,94,.4)', background: 'rgba(27,76,94,.06)', padding: '2px 7px', borderRadius: 999 }}>Meta Ads</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: scoreColor(lead.lead_score) }}>{lead.lead_score}</span>
      </div>
    </div>
  );
}

// ── Add Lead Drawer ───────────────────────────────────────────────────────────
function AddLeadDrawer({ formDef, onClose, onSave, stages = STAGES }) {
  const isMobile = useIsMobile();
  const empty = { name: '', phone: '', email: '', company: '', jobTitle: '', lead_score: '50', lead_status: 'New', source: 'Manual' };
  const [form, setForm] = useState(empty);
  const [attrs, setAttrs] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function setAttr(k, v) { setAttrs(a => ({ ...a, [k]: v })); }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.phone.trim()) e.phone = 'WhatsApp phone is required';
    if (!form.source) e.source = 'Pick a source';
    return e;
  }

  async function submit(e) {
    e.preventDefault();
    const e2 = validate();
    if (Object.keys(e2).length) { setErrors(e2); return; }
    setSaving(true);
    await onSave({ ...form, attributes: attrs, form_id: formDef?.id });
    setSaving(false);
  }

  const inputStyle = (err) => ({
    width: '100%', padding: '9px 12px', border: `1px solid ${err ? '#C7503B' : 'rgba(27,76,94,.18)'}`,
    borderRadius: 9, fontSize: 13, color: 'var(--brand-primary)', background: '#fff', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box',
  });
  const labelStyle = { fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(27,76,94,.5)', display: 'block', marginBottom: 5 };
  const fieldWrap = { marginBottom: 14 };
  const sectionHead = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: 'rgba(27,76,94,.45)', margin: '18px 0 10px', paddingBottom: 6, borderBottom: '1px solid rgba(27,76,94,.08)' };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(14,58,53,.18)', zIndex: 30 }} />

      {/* Drawer */}
      <div className="fade-up" style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: isMobile ? '100vw' : 380, background: '#fff', borderLeft: '1px solid rgba(27,76,94,.12)', boxShadow: '-12px 0 32px rgba(14,58,53,.14)', zIndex: 210, display: 'flex', flexDirection: 'column' }}>

        {/* Drawer header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(27,76,94,.09)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--brand-primary)' }}>Add Lead</div>
            {formDef && <div style={{ fontSize: 11.5, color: 'rgba(27,76,94,.5)', marginTop: 2 }}>{formDef.name}</div>}
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#F2F6F3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.55)' }}>
            <IconX size={14} />
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={submit} style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 20px' }}>

          <div style={sectionHead}>CONTACT INFO</div>

          <div style={fieldWrap}>
            <label style={labelStyle}>Full Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Riya Sharma" style={inputStyle(errors.name)} />
            {errors.name && <div style={{ fontSize: 11, color: '#C7503B', marginTop: 3 }}>{errors.name}</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>Phone (WhatsApp) *</label>
              <input value={form.phone} onChange={e => { set('phone', e.target.value); setErrors(er => ({ ...er, phone: undefined })); }} placeholder="+91 98765 43210" style={inputStyle(errors.phone)} />
              {errors.phone && <div style={{ fontSize: 11, color: '#C7503B', marginTop: 3 }}>{errors.phone}</div>}
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Email</label>
              <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@email.com" style={inputStyle()} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>Company</label>
              <input value={form.company} onChange={e => set('company', e.target.value)} placeholder="Company name" style={inputStyle()} />
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Job Title</label>
              <input value={form.jobTitle} onChange={e => set('jobTitle', e.target.value)} placeholder="Role / Designation" style={inputStyle()} />
            </div>
          </div>

          <div style={sectionHead}>LEAD DETAILS</div>

          {/* Source */}
          <div style={fieldWrap}>
            <label style={labelStyle}>Source *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              {LEAD_SOURCES.map(s => (
                <button
                  key={s.key} type="button"
                  onClick={() => { set('source', s.key); setErrors(er => ({ ...er, source: undefined })); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: form.source === s.key ? 700 : 500, border: `1.5px solid ${form.source === s.key ? 'var(--brand-primary)' : 'rgba(27,76,94,.15)'}`, background: form.source === s.key ? 'var(--brand-primary)' : '#fff', color: form.source === s.key ? 'var(--app-bg)' : 'var(--brand-primary)', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 14 }}>{s.icon}</span> {s.label}
                </button>
              ))}
            </div>
            {errors.source && <div style={{ fontSize: 11, color: '#C7503B', marginTop: 4 }}>{errors.source}</div>}
          </div>

          {/* Stage + Score */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>Pipeline Stage</label>
              <select value={form.lead_status} onChange={e => set('lead_status', e.target.value)} style={{ ...inputStyle(), appearance: 'none', paddingRight: 30, backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2315514B' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
                {stages.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Lead Score (0–100)</label>
              <input type="number" min="0" max="100" value={form.lead_score} onChange={e => set('lead_score', e.target.value)} style={inputStyle()} />
            </div>
          </div>

          {/* Dynamic form attributes */}
          {formDef && formDef.fields.length > 0 && (
            <>
              <div style={sectionHead}>FORM FIELDS · {formDef.name.toUpperCase()}</div>
              {formDef.fields.map(f => (
                <div key={f.key} style={fieldWrap}>
                  <label style={labelStyle}>{f.label.toUpperCase()}</label>
                  <input value={attrs[f.key] || ''} onChange={e => setAttr(f.key, e.target.value)} placeholder={`Enter ${f.label.toLowerCase()}`} style={inputStyle()} />
                </div>
              ))}
            </>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid rgba(27,76,94,.18)', background: '#fff', color: 'var(--brand-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: 'var(--brand-primary)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Adding…' : 'Add Lead'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Main CRM screen ───────────────────────────────────────────────────────────
export default function CRM() {
  const isMobile = useIsMobile();
  const [forms, setForms] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formId, setFormId] = useState('');            // '' = all leads
  const [view, setView] = useState('kanban');
  const [search, setSearch] = useState('');
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [selContact, setSelContact] = useState(null);
  const [showFormDropdown, setShowFormDropdown] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [stages, setStages] = useState(STAGES);

  async function load() {
    const [f, l, st] = await Promise.all([getFormsLive(), getPeopleLive(), getPipelineStages()]);
    setForms(f); setAllLeads(l); setStages(st); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const formDef = forms.find(f => f.id === formId) || null;

  const leads = allLeads.filter(l => {
    if (formId && l.form_uuid !== formId) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!(l.profile_name || '').toLowerCase().includes(q) &&
          !(l.company || '').toLowerCase().includes(q) &&
          !(l.phone || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  async function handleAddLead(leadData) {
    const res = await addLeadLive(leadData);
    if (res.ok) { await load(); setShowAddLead(false); }
    else alert('Could not add lead: ' + (res.error || 'unknown error'));
  }

  function switchForm(id) {
    setFormId(id);
    setSelContact(null);
    setShowFormDropdown(false);
  }

  function handleDrop(stage) {
    const lead = allLeads.find(l => l.id === dragId);
    if (lead && lead.lead_status !== stage) {
      updateLeadStatusLive(dragId, stage);
      setAllLeads(prev => prev.map(l => l.id === dragId ? { ...l, lead_status: stage } : l));
      if (selContact?.id === dragId) setSelContact(c => ({ ...c, lead_status: stage }));
    }
    setDragId(null);
    setDragOver(null);
  }

  const byStage = stage => leads.filter(l => l.lead_status === stage);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>

      {/* Header */}
      <header style={{ padding: isMobile ? '16px 16px 0' : '20px 28px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: 'rgba(27,76,94,.45)' }}>COLLECTIONS</div>
            <h1 style={{ margin: '5px 0 0', fontSize: 22, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--brand-primary)' }}>CRM</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

            {/* Form selector */}
            <div style={{ position: 'relative', flex: isMobile ? '1 1 100%' : 'none' }}>
              <button onClick={() => setShowFormDropdown(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid rgba(27,76,94,.18)', borderRadius: 10, padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)', minWidth: isMobile ? '100%' : 210 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: 'var(--brand-accent-soft)', flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formDef?.name || 'All leads'}</span>
                <span style={{ color: 'rgba(27,76,94,.45)', display: 'flex', flexShrink: 0 }}><IconChevDown size={13} /></span>
              </button>
              {showFormDropdown && (
                <div style={{ position: 'absolute', top: '110%', left: 0, background: '#fff', border: '1px solid rgba(27,76,94,.14)', borderRadius: 11, boxShadow: '0 8px 24px rgba(14,58,53,.13)', zIndex: 50, minWidth: 250, overflow: 'hidden' }}>
                  <button onClick={() => switchForm('')} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '11px 14px', background: !formId ? '#F2F8F2' : '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: !formId ? 700 : 500, color: 'var(--brand-primary)', borderBottom: '1px solid rgba(27,76,94,.06)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: !formId ? 'var(--brand-accent-soft)' : 'rgba(27,76,94,.25)', flexShrink: 0 }} />
                    All leads
                  </button>
                  {forms.map(f => (
                    <button key={f.id} onClick={() => switchForm(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '11px 14px', background: f.id === formId ? '#F2F8F2' : '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: f.id === formId ? 700 : 500, color: 'var(--brand-primary)', borderBottom: '1px solid rgba(27,76,94,.06)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: f.id === formId ? 'var(--brand-accent-soft)' : 'rgba(27,76,94,.25)', flexShrink: 0 }} />
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* View toggle */}
            <div style={{ display: 'flex', gap: 2, background: '#fff', border: '1px solid rgba(27,76,94,.14)', borderRadius: 10, padding: 3 }}>
              {[{ key: 'kanban', label: 'Kanban' }, { key: 'list', label: 'List' }].map(v => (
                <button key={v.key} onClick={() => setView(v.key)} style={{ padding: '7px 15px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, border: 'none', fontWeight: view === v.key ? 700 : 500, background: view === v.key ? 'var(--brand-primary)' : 'transparent', color: view === v.key ? '#EAF6E4' : 'rgba(27,76,94,.65)' }}>
                  {v.label}
                </button>
              ))}
            </div>

            <button onClick={() => { setShowAddLead(true); setSelContact(null); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--brand-accent-soft)', border: 'none', color: 'var(--brand-primary-dark)', fontSize: 13, fontWeight: 800, padding: '10px 16px', borderRadius: 10, cursor: 'pointer' }}>
              <IconPlus size={15} /> Add Lead
            </button>
          </div>
        </div>

        {/* Form field pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 14, borderBottom: '1px solid rgba(27,76,94,.09)' }}>
          {formDef ? (
            <>
              <span style={{ fontSize: 11.5, color: 'rgba(27,76,94,.5)', fontWeight: 600, marginRight: 4 }}>Form fields:</span>
              {(formDef.fields || []).map(f => (
                <span key={f.key} style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-primary)', background: '#fff', border: '1px solid rgba(27,76,94,.15)', padding: '3px 11px', borderRadius: 999 }}>{f.label}</span>
              ))}
            </>
          ) : (
            <span style={{ fontSize: 11.5, color: 'rgba(27,76,94,.5)', fontWeight: 600 }}>All leads across every form</span>
          )}
          <span style={{ fontSize: 11.5, color: 'rgba(27,76,94,.45)', marginLeft: 6 }}>{leads.length} lead{leads.length === 1 ? '' : 's'}</span>
        </div>
      </header>

      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.5)', fontSize: 14 }}>Loading leads…</div>
      )}

      {/* ── KANBAN VIEW ── */}
      {!loading && view === 'kanban' && (
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: isMobile ? '14px 16px 18px' : '18px 28px 24px' }}>
          <div style={{ display: 'flex', gap: 12, height: '100%', minWidth: stages.length * 230 }}>
            {stages.map(stage => {
              const ss = stageStyle(stage);
              const cards = byStage(stage);
              const isOver = dragOver === stage;
              return (
                <div
                  key={stage}
                  onDragOver={e => { e.preventDefault(); setDragOver(stage); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => handleDrop(stage)}
                  style={{ flex: '0 0 220px', display: 'flex', flexDirection: 'column', borderRadius: 14, background: isOver ? ss.hd : ss.col, border: `1.5px solid ${isOver ? ss.dot : 'rgba(27,76,94,.13)'}`, transition: 'background .15s, border .15s', minHeight: 200 }}
                >
                  {/* Column header */}
                  <div style={{ padding: '11px 13px 10px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: ss.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: ss.fg, flex: 1 }}>{stage}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, background: ss.count, color: ss.fg, padding: '2px 8px', borderRadius: 999 }}>{cards.length}</span>
                  </div>

                  {/* Cards */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '2px 10px 10px' }}>
                    {cards.map(lead => (
                      <KanbanCard
                        key={lead.id}
                        lead={lead}
                        formDef={formDef}
                        onDragStart={() => setDragId(lead.id)}
                        onClick={() => setSelContact(selContact?.id === lead.id ? null : lead)}
                      />
                    ))}
                    {cards.length === 0 && (
                      <div style={{ padding: '16px 8px', textAlign: 'center', fontSize: 11.5, color: 'rgba(27,76,94,.35)', fontStyle: 'italic' }}>Drop cards here</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {!loading && view === 'list' && (
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: isMobile ? '14px 16px 24px' : '16px 28px 32px', position: 'relative' }}>

          {/* Search bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(27,76,94,.16)', borderRadius: 10, padding: '9px 14px', background: '#fff', marginBottom: 14, maxWidth: 340 }}>
            <span style={{ width: 14, height: 14, color: 'rgba(27,76,94,.4)', display: 'flex' }}><IconSearch size={14} /></span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--brand-primary)', width: '100%', fontFamily: 'inherit' }} />
          </div>

          <div style={{ background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 14, overflow: 'hidden', minWidth: isMobile ? 620 : 'auto' }}>
            {/* Dynamic column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: `2fr ${(formDef?.fields || []).map(() => '1fr').join(' ')} 1fr .8fr 1fr`, gap: 10, padding: '12px 18px', background: '#F6FAF6', borderBottom: '1px solid rgba(27,76,94,.08)', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: 'rgba(27,76,94,.5)' }}>
              <span>NAME</span>
              {(formDef?.fields || []).map(f => <span key={f.key}>{f.label.toUpperCase()}</span>)}
              <span>STATUS</span>
              <span>SCORE</span>
              <span>LAST SEEN</span>
            </div>

            {/* Rows */}
            {leads.map(lead => (
              <div key={lead.id} onClick={() => setSelContact(selContact?.id === lead.id ? null : lead)} style={{ display: 'grid', gridTemplateColumns: `2fr ${(formDef?.fields || []).map(() => '1fr').join(' ')} 1fr .8fr 1fr`, gap: 10, padding: '13px 18px', alignItems: 'center', borderBottom: '1px solid rgba(27,76,94,.05)', cursor: 'pointer', fontSize: 12.5, color: 'rgba(27,76,94,.7)', background: lead.id === selContact?.id ? '#F2F8F2' : 'transparent' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: lead.color || 'var(--brand-muted)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{lead.profile_name?.charAt(0)}</span>
                  <span style={{ fontWeight: 700, color: 'var(--brand-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.profile_name}</span>
                </span>
                {(formDef?.fields || []).map(f => (
                  <span key={f.key} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(lead.attributes || {})[f.key] || '-'}</span>
                ))}
                <span><span style={leadChip(lead.lead_status)}>{lead.lead_status}</span></span>
                <span style={{ fontWeight: 700, color: scoreColor(lead.lead_score) }}>{lead.lead_score}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.lastContacted}</span>
              </div>
            ))}
          </div>

          {/* Contact detail panel */}
          {selContact && (
            <ContactPanel contact={selContact} formDef={formDef} onClose={() => setSelContact(null)} />
          )}
        </div>
      )}

      {/* Contact panel for kanban view */}
      {view === 'kanban' && selContact && (
        <ContactPanel contact={selContact} formDef={formDef} onClose={() => setSelContact(null)} />
      )}

      {/* Add Lead drawer */}
      {showAddLead && (
        <AddLeadDrawer
          formDef={formDef}
          stages={stages}
          onClose={() => setShowAddLead(false)}
          onSave={handleAddLead}
        />
      )}

      {/* Close form dropdown on outside click */}
      {showFormDropdown && <div onClick={() => setShowFormDropdown(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { getFormsLive, getPeopleLive, updateLeadStatusLive, addLeadLive, getStageConfig } from '../liveData';
import { IconPlus, IconSearch, IconChevDown, IconX } from '../icons';
import { useIsMobile } from '../useIsMobile';
import TemperatureTag from '../components/TemperatureTag';
import LeadDetailModal from '../components/LeadDetailModal';
import {
  LEAD_STAGES, DEAL_STAGES, PIPELINES, DEAD_STAGES, WON_STAGES,
  pipelineOf, formatCr, sumDealValue, openDealValue, TEMPERATURES, tempStyle, leadChip, STAGE_CHIP,
} from '../pipeline';

// ── Pipeline stages ──────────────────────────────────────────────────────────
const STAGES = LEAD_STAGES;

const LEAD_SOURCES = [
  { key: 'Meta Lead Ads', label: 'Meta Ads', icon: '📘' },
  { key: 'Google Ads',    label: 'Google Ads', icon: '🔍' },
  { key: 'Website',       label: 'Website', icon: '🌐' },
  { key: 'Referral',      label: 'Referral', icon: '🤝' },
  { key: 'WhatsApp',      label: 'WhatsApp', icon: '💬' },
  { key: 'Manual',        label: 'Manual', icon: '✍️' },
];

// Both boards run cool-to-committed left to right: faint at New, solid forest
// by Negotiation, green at Booked, and greyed out once a lead is dead.
const STAGE_STYLE = {
  // Lead pipeline
  New:              { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'rgba(27,76,94,.25)', fg: 'var(--brand-primary)', count: 'rgba(27,76,94,.08)' },
  Attempted:        { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'rgba(27,76,94,.35)', fg: 'var(--brand-primary)', count: 'rgba(27,76,94,.08)' },
  Contacted:        { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'rgba(27,76,94,.5)',  fg: 'var(--brand-primary)', count: 'rgba(27,76,94,.10)' },
  'Follow Up':      { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'var(--brand-accent-soft)', fg: 'var(--brand-primary)', count: 'rgba(192,138,69,.18)' },
  Qualified:        { col: 'var(--app-bg)', hd: '#E2EBE6', dot: '#3B6B45', fg: 'var(--brand-primary)', count: 'rgba(115,167,111,.20)' },
  Junk:             { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'rgba(27,76,94,.18)', fg: 'rgba(27,76,94,.5)', count: 'rgba(27,76,94,.06)' },
  // Deal pipeline
  'Visit Scheduled': { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'rgba(192,138,69,.55)', fg: 'var(--brand-primary)', count: 'rgba(192,138,69,.16)' },
  Visited:          { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'var(--brand-accent-soft)', fg: 'var(--brand-primary)', count: 'rgba(192,138,69,.20)' },
  'Offer Made':     { col: 'var(--app-bg)', hd: '#E2EBE6', dot: '#C08A45', fg: 'var(--brand-primary)', count: 'rgba(192,138,69,.24)' },
  Negotiation:      { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'var(--brand-primary)', fg: 'var(--brand-primary)', count: 'rgba(27,76,94,.13)' },
  Booked:           { col: 'var(--app-bg)', hd: '#E2EBE6', dot: '#3B6B45', fg: 'var(--brand-primary)', count: 'rgba(115,167,111,.20)' },
  Lost:             { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'rgba(27,76,94,.18)', fg: 'rgba(27,76,94,.5)', count: 'rgba(27,76,94,.06)' },
};

// Style for a stage column — falls back gracefully for custom stage names.
function stageStyle(stage) {
  return STAGE_STYLE[stage] || { col: 'var(--app-bg)', hd: '#E2EBE6', dot: 'rgba(27,76,94,.45)', fg: 'var(--brand-primary)', count: 'rgba(27,76,94,.10)' };
}

const SELECT_ARROW = `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2315514B' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`;

function scoreColor(score) {
  if (score >= 75) return 'var(--brand-accent-soft)';
  if (score >= 50) return 'var(--brand-primary)';
  return 'rgba(27,76,94,.4)';
}

// ── Kanban card ───────────────────────────────────────────────────────────────
function KanbanCard({ lead, formDef, onDragStart, onClick, showValue = false }) {
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
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.profile_name}</span>
            <TemperatureTag temp={lead.temperature} override={lead.temperature_override} />
          </div>
          {lead.company !== '-' && <div style={{ fontSize: 10.5, color: 'rgba(27,76,94,.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company}</div>}
        </div>
      </div>
      {preview.map(p => (
        <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
          <span style={{ color: 'rgba(27,76,94,.5)', fontWeight: 600 }}>{p.label}</span>
          <span style={{ color: 'var(--brand-primary)', fontWeight: 700 }}>{p.val}</span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 9, paddingTop: 9, borderTop: '1px solid rgba(27,76,94,.07)' }}>
        {/* On the Deal board the money is the headline; the lead score stops
            mattering once someone has taken the call. */}
        {showValue ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: lead.deal_value_cr ? 'var(--brand-primary)' : 'rgba(27,76,94,.3)' }}>
            {formatCr(lead.deal_value_cr, { dash: 'No value' })}
          </span>
        ) : (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(27,76,94,.4)', background: 'rgba(27,76,94,.06)', padding: '2px 7px', borderRadius: 999 }}>Meta Ads</span>
        )}
        <span style={{ fontSize: 12, fontWeight: 800, color: scoreColor(lead.lead_score), flexShrink: 0 }}>{lead.lead_score}</span>
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
export default function CRM({ onOpenChat }) {
  const isMobile = useIsMobile();
  const [forms, setForms] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formId, setFormId] = useState('');            // '' = all leads
  const [view, setView] = useState('kanban');
  const [stageFilter, setStageFilter] = useState('all');
  // Phones never get the board: no drag target, and six columns off-screen.
  const effectiveView = isMobile ? 'list' : view;
  const [search, setSearch] = useState('');
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [selContact, setSelContact] = useState(null);
  const [showFormDropdown, setShowFormDropdown] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [cfg, setCfg] = useState({ lead: LEAD_STAGES, deal: DEAL_STAGES });
  const [pipeline, setPipeline] = useState('lead');
  const [tempFilter, setTempFilter] = useState('all');

  async function load() {
    const [f, l, st] = await Promise.all([getFormsLive(), getPeopleLive(), getStageConfig()]);
    setForms(f); setAllLeads(l); setCfg(st); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const formDef = forms.find(f => f.id === formId) || null;
  const stages = pipeline === 'deal' ? cfg.deal : cfg.lead;

  // Patch one lead in place rather than refetching all 92 — the detail panel
  // stays open and the card just re-renders where it is.
  function patchLead(id, patch) {
    setAllLeads(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    setSelContact(c => (c && c.id === id ? { ...c, ...patch } : c));
  }

  // Everything matching the current form + search, before the board split. The
  // board toggle counts read off this so both numbers stay honest.
  const matching = useMemo(() => allLeads.filter(l => {
    if (formId && l.form_uuid !== formId) return false;
    if (tempFilter !== 'all' && l.temperature !== tempFilter) return false;
    if (stageFilter !== 'all' && l.lead_status !== stageFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!(l.profile_name || '').toLowerCase().includes(q) &&
          !(l.company || '').toLowerCase().includes(q) &&
          !(l.phone || '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [allLeads, formId, search, tempFilter, stageFilter]);

  const counts = useMemo(() => ({
    lead: matching.filter(l => pipelineOf(l.lead_status, cfg.deal) === 'lead').length,
    deal: matching.filter(l => pipelineOf(l.lead_status, cfg.deal) === 'deal').length,
  }), [matching, cfg.deal]);

  // Per-stage counts for the filter pills. Derived before the stage filter is
  // applied, otherwise every pill would show the count of itself.
  const stageCounts = useMemo(() => {
    const base = allLeads.filter(l => {
      if (formId && l.form_uuid !== formId) return false;
      if (tempFilter !== 'all' && l.temperature !== tempFilter) return false;
      return pipelineOf(l.lead_status, cfg.deal) === pipeline;
    });
    const out = { all: base.length };
    stages.forEach(st => { out[st] = base.filter(l => l.lead_status === st).length; });
    return out;
  }, [allLeads, formId, tempFilter, pipeline, cfg.deal, stages]);

  const leads = useMemo(
    () => matching.filter(l => pipelineOf(l.lead_status, cfg.deal) === pipeline),
    [matching, pipeline, cfg.deal]);

  // Only what is still in play. Booked has already landed and Lost never will.
  const boardValue = useMemo(() => openDealValue(leads), [leads]);
  const bookedValue = useMemo(
    () => sumDealValue(leads.filter(l => WON_STAGES.includes(l.lead_status))), [leads]);

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

  // Stage change from the list. `lead_status` is authoritative and the DB
  // derives the board from it, so this is the same write the kanban drag makes.
  function changeStage(id, stage) {
    const lead = allLeads.find(l => l.id === id);
    if (!lead || lead.lead_status === stage) return;
    updateLeadStatusLive(id, stage);
    patchLead(id, { lead_status: stage, pipeline: pipelineOf(stage, cfg.deal) });
  }

  function handleDrop(stage) {
    const lead = allLeads.find(l => l.id === dragId);
    if (lead && lead.lead_status !== stage) {
      updateLeadStatusLive(dragId, stage);
      // The DB derives `pipeline` from the stage; mirror that here so the card
      // does not flicker onto the wrong board before the next load.
      patchLead(dragId, { lead_status: stage, pipeline: pipelineOf(stage, cfg.deal) });
    }
    setDragId(null);
    setDragOver(null);
  }

  const byStage = stage => leads.filter(l => l.lead_status === stage);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', overflowY: isMobile ? 'auto' : 'visible' }}>

      {/* Header */}
      <header style={{ padding: isMobile ? '16px 16px 0' : '20px 28px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: 'rgba(27,76,94,.45)' }}>COLLECTIONS</div>
            <h1 style={{ margin: '5px 0 0', fontSize: 22, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--brand-primary)' }}>CRM</h1>
          </div>

          {/* Board switch. Two genuinely separate funnels, so this sits at the
              top rather than hiding as a filter. */}
          <div style={{ display: 'flex', gap: 3, background: '#fff', border: '1px solid rgba(27,76,94,.14)', borderRadius: 12, padding: 3, flex: isMobile ? '1 1 100%' : 'none', order: isMobile ? 3 : 0 }}>
            {PIPELINES.map(p => {
              const on = pipeline === p.key;
              return (
                <button key={p.key} onClick={() => { setPipeline(p.key); setStageFilter('all'); setSelContact(null); }}
                  style={{
                    flex: isMobile ? 1 : 'none', padding: '7px 16px', borderRadius: 9, border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.3, textAlign: 'center',
                    background: on ? 'var(--brand-primary)' : 'transparent',
                    color: on ? '#EAF6E4' : 'rgba(27,76,94,.65)',
                  }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: on ? 800 : 600 }}>
                    {p.label} <span style={{ opacity: .65, fontWeight: 700 }}>{counts[p.key]}</span>
                  </span>
                  <span style={{ display: 'block', fontSize: 9.5, fontWeight: 600, opacity: on ? .7 : .5 }}>{p.blurb}</span>
                </button>
              );
            })}
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

            {/* View toggle — desktop only; a phone has just the list */}
            <div style={{ display: isMobile ? 'none' : 'flex', gap: 2, background: '#fff', border: '1px solid rgba(27,76,94,.14)', borderRadius: 10, padding: 3 }}>
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

        {/* Tag filter + what the board is worth */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 12, flexWrap: 'wrap' }}>
          {[{ key: 'all', label: 'All' }, ...TEMPERATURES.map(t => ({ key: t, label: tempStyle(t).label }))].map(f => {
            const on = tempFilter === f.key;
            const n = f.key === 'all'
              ? matching.length
              : matching.filter(l => l.temperature === f.key).length;
            const s = f.key === 'all' ? null : tempStyle(f.key);
            return (
              <button key={f.key} onClick={() => setTempFilter(f.key)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
                padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid ' + (on ? 'var(--brand-primary)' : 'rgba(27,76,94,.16)'),
                background: on ? 'var(--brand-primary)' : '#fff',
                color: on ? '#EAF6E4' : 'rgba(27,76,94,.7)',
              }}>
                {s && <span style={{ width: 7, height: 7, borderRadius: '50%', background: on ? '#EAF6E4' : s.dot }} />}
                {f.label} <span style={{ opacity: .65 }}>{n}</span>
              </button>
            );
          })}

          <span style={{ flex: isMobile ? 'none' : 1 }} />

          {pipeline === 'deal' && (
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7, fontSize: 12, color: 'rgba(27,76,94,.5)', fontWeight: 600 }}>
              <span>In play</span>
              <strong style={{ fontSize: 16, fontWeight: 800, color: 'var(--brand-primary)' }}>{formatCr(boardValue)}</strong>
              {bookedValue > 0 && <span style={{ color: '#3B6B45', fontWeight: 700 }}>· {formatCr(bookedValue)} booked</span>}
            </span>
          )}
        </div>

        {/* Stage filter. The board itself is the desktop filter; on a phone the
            list is all there is, so the stages need to be reachable here. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 12, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {[{ key: 'all', label: pipeline === 'deal' ? 'All deals' : 'All leads' },
            ...stages.map(st => ({ key: st, label: st }))].map(f => {
            const on = stageFilter === f.key;
            const n = stageCounts[f.key] ?? 0;
            const tone = f.key === 'all' ? null : (STAGE_CHIP[f.key] || {});
            return (
              <button key={f.key} onClick={() => setStageFilter(f.key)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 999,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                border: '1px solid ' + (on ? 'var(--brand-primary)' : 'rgba(27,76,94,.16)'),
                background: on ? 'var(--brand-primary)' : '#fff',
                color: on ? '#EAF6E4' : (n === 0 ? 'rgba(27,76,94,.38)' : 'rgba(27,76,94,.72)'),
              }}>
                {tone && <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: on ? '#EAF6E4' : (tone.bg && tone.bg.startsWith('var') ? 'var(--brand-primary)' : (tone.fg || 'rgba(27,76,94,.4)')) }} />}
                {f.label} <span style={{ opacity: .62 }}>{n}</span>
              </button>
            );
          })}
        </div>

        {/* Form field pills — desktop only; the board switch already carries the count */}
        <div style={{ display: isMobile ? 'none' : 'flex', alignItems: 'center', gap: 8, paddingBottom: 14, borderBottom: '1px solid rgba(27,76,94,.09)', flexWrap: 'wrap' }}>
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
          <span style={{ fontSize: 11.5, color: 'rgba(27,76,94,.45)', marginLeft: 6 }}>
            {leads.length} {pipeline === 'deal' ? 'deal' : 'lead'}{leads.length === 1 ? '' : 's'} on this board
          </span>
        </div>
      </header>

      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.5)', fontSize: 14 }}>Loading leads…</div>
      )}

      {/* ── KANBAN VIEW ── */}
      {!loading && effectiveView === 'kanban' && (
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
                  {/* Column header — on the Deal board each column carries its
                      own subtotal, so the forecast reads left to right. */}
                  <div style={{ padding: '11px 13px 10px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ss.dot, flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: ss.fg, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stage}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, background: ss.count, color: ss.fg, padding: '2px 8px', borderRadius: 999, flexShrink: 0 }}>{cards.length}</span>
                    </div>
                    {pipeline === 'deal' && cards.length > 0 && (
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: DEAD_STAGES.includes(stage) ? 'rgba(27,76,94,.35)' : 'rgba(27,76,94,.6)', marginTop: 4, marginLeft: 16 }}>
                        {formatCr(sumDealValue(cards))}
                      </div>
                    )}
                  </div>

                  {/* Cards */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '2px 10px 10px' }}>
                    {cards.map(lead => (
                      <KanbanCard
                        key={lead.id}
                        lead={lead}
                        formDef={formDef}
                        showValue={pipeline === 'deal'}
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
      {!loading && effectiveView === 'list' && (
        <div style={{ flex: isMobile ? 'none' : 1, overflowY: isMobile ? 'visible' : 'auto', overflowX: isMobile ? 'visible' : 'auto', padding: isMobile ? '14px 16px 28px' : '16px 28px 32px', position: 'relative' }}>

          {/* Search bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(27,76,94,.16)', borderRadius: 10, padding: '9px 14px', background: '#fff', marginBottom: 14, maxWidth: 340 }}>
            <span style={{ width: 14, height: 14, color: 'rgba(27,76,94,.4)', display: 'flex' }}><IconSearch size={14} /></span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--brand-primary)', width: '100%', fontFamily: 'inherit' }} />
          </div>

          {/* Phone: a card per lead with the stage editable in place. The board
              is not available here, so changing a stage has to be possible from
              the list itself. */}
          {isMobile && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {leads.length === 0 && (
                  <div style={{ background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 14, padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'rgba(27,76,94,.5)' }}>
                    No {pipeline === 'deal' ? 'deals' : 'leads'} match this view.
                  </div>
                )}
                {leads.map(lead => (
                  <div key={lead.id} style={{ background: lead.id === selContact?.id ? '#F2F8F2' : '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 14, padding: '12px 13px' }}>
                    <button onClick={() => setSelContact(selContact?.id === lead.id ? null : lead)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: 'var(--brand-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.profile_name}</span>
                        <span style={{ display: 'block', fontSize: 12, color: 'rgba(27,76,94,.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lead.company !== '-' ? lead.company : lead.phone}
                        </span>
                      </span>
                      <TemperatureTag temp={lead.temperature} override={lead.temperature_override} />
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
                      {/* Stage, changeable right here. Moving it onto a deal
                          stage crosses the lead to the other board, which is
                          why the row can vanish from the current filter. */}
                      <select
                        value={lead.lead_status}
                        onChange={e => changeStage(lead.id, e.target.value)}
                        aria-label={`Stage for ${lead.profile_name}`}
                        style={{
                          ...leadChip(lead.lead_status), flex: 1, minWidth: 0, fontSize: 12.5,
                          padding: '8px 26px 8px 12px', border: 'none', borderRadius: 999,
                          fontFamily: 'inherit', cursor: 'pointer', appearance: 'none',
                          backgroundImage: SELECT_ARROW, backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 10px center',
                        }}>
                        <optgroup label="Leads — before the call">
                          {cfg.lead.map(st => <option key={st} value={st}>{st}</option>)}
                        </optgroup>
                        <optgroup label="Deals — after the call">
                          {cfg.deal.map(st => <option key={st} value={st}>{st}</option>)}
                        </optgroup>
                      </select>
                      {pipeline === 'deal' && (
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: lead.deal_value_cr ? 'var(--brand-primary)' : 'rgba(27,76,94,.3)', flexShrink: 0 }}>
                          {formatCr(lead.deal_value_cr, { dash: '—' })}
                        </span>
                      )}
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: scoreColor(lead.lead_score), flexShrink: 0, minWidth: 20, textAlign: 'right' }}>{lead.lead_score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ display: isMobile ? 'none' : 'block', background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 14, overflow: 'hidden' }}>
            {/* Dynamic column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: `2fr ${(formDef?.fields || []).map(() => '1fr').join(' ')} 1.1fr ${pipeline === 'deal' ? '.9fr ' : ''}.7fr 1fr`, gap: 10, padding: '12px 18px', background: '#F6FAF6', borderBottom: '1px solid rgba(27,76,94,.08)', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: 'rgba(27,76,94,.5)' }}>
              <span>NAME</span>
              {(formDef?.fields || []).map(f => <span key={f.key}>{f.label.toUpperCase()}</span>)}
              <span>{pipeline === 'deal' ? 'DEAL STAGE' : 'STATUS'}</span>
              {pipeline === 'deal' && <span>VALUE</span>}
              <span>SCORE</span>
              <span>LAST SEEN</span>
            </div>

            {/* Rows */}
            {leads.map(lead => (
              <div key={lead.id} onClick={() => setSelContact(selContact?.id === lead.id ? null : lead)} style={{ display: 'grid', gridTemplateColumns: `2fr ${(formDef?.fields || []).map(() => '1fr').join(' ')} 1.1fr ${pipeline === 'deal' ? '.9fr ' : ''}.7fr 1fr`, gap: 10, padding: '13px 18px', alignItems: 'center', borderBottom: '1px solid rgba(27,76,94,.05)', cursor: 'pointer', fontSize: 12.5, color: 'rgba(27,76,94,.7)', background: lead.id === selContact?.id ? '#F2F8F2' : 'transparent' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, color: 'var(--brand-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.profile_name}</span>
                  <TemperatureTag temp={lead.temperature} override={lead.temperature_override} />
                </span>
                {(formDef?.fields || []).map(f => (
                  <span key={f.key} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(lead.attributes || {})[f.key] || '-'}</span>
                ))}
                <span onClick={e => e.stopPropagation()}>
                  <select value={lead.lead_status} onChange={e => changeStage(lead.id, e.target.value)}
                    aria-label={`Stage for ${lead.profile_name}`}
                    style={{ ...leadChip(lead.lead_status), maxWidth: '100%', fontSize: 11.5, padding: '4px 24px 4px 11px', border: 'none', borderRadius: 999, fontFamily: 'inherit', cursor: 'pointer', appearance: 'none', backgroundImage: SELECT_ARROW, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 9px center' }}>
                    <optgroup label="Leads — before the call">
                      {cfg.lead.map(st => <option key={st} value={st}>{st}</option>)}
                    </optgroup>
                    <optgroup label="Deals — after the call">
                      {cfg.deal.map(st => <option key={st} value={st}>{st}</option>)}
                    </optgroup>
                  </select>
                </span>
                {pipeline === 'deal' && (
                  <span style={{ fontWeight: 800, color: lead.deal_value_cr ? 'var(--brand-primary)' : 'rgba(27,76,94,.3)' }}>{formatCr(lead.deal_value_cr)}</span>
                )}
                <span style={{ fontWeight: 700, color: scoreColor(lead.lead_score) }}>{lead.lead_score}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.lastContacted}</span>
              </div>
            ))}
          </div>

          {/* Contact detail panel */}
          {selContact && (
            <LeadDetailModal contact={selContact} formDef={formDef} onClose={() => setSelContact(null)} onUpdate={patchLead} onOpenChat={onOpenChat} />
          )}
        </div>
      )}

      {/* Contact panel for kanban view */}
      {effectiveView === 'kanban' && selContact && (
        <LeadDetailModal contact={selContact} formDef={formDef} onClose={() => setSelContact(null)} onUpdate={patchLead} onOpenChat={onOpenChat} />
      )}

      {/* Add Lead drawer */}
      {showAddLead && (
        <AddLeadDrawer
          formDef={formDef}
          stages={cfg.lead}
          onClose={() => setShowAddLead(false)}
          onSave={handleAddLead}
        />
      )}

      {/* Close form dropdown on outside click */}
      {showFormDropdown && <div onClick={() => setShowFormDropdown(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}
    </div>
  );
}

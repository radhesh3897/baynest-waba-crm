import { useState, useEffect } from 'react';
import { getPeopleLive, getFormsLive, syncFormsFromMeta, deletePersonLive, addContactLive } from '../liveData';
import { IconSearch, IconPlus, IconX, IconMail, IconPhone, IconWhatsApp, IconZap, IconEdit, IconChevDown, IconRefresh } from '../icons';
import { useIsMobile } from '../useIsMobile';
import ContactNotes, { LeadAnswers } from '../components/ContactNotes';
import LeadProperties from '../components/LeadProperties';
import TemperatureTag from '../components/TemperatureTag';
import PipelineMover from '../components/PipelineMover';
import { leadChip, formatCr, pipelineOf } from '../pipeline';


export default function People({ onOpenChat }) {
  const isMobile = useIsMobile();
  const [contacts, setContacts] = useState([]);
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState(null);
  const [formId, setFormId] = useState('');
  const [showFormDD, setShowFormDD] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', phone: '', email: '', company: '', source: 'Manual', customSource: '' });
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState('');

  async function loadPeople() { setContacts(await getPeopleLive()); setLoading(false); }
  async function loadForms() { setForms(await getFormsLive()); }
  useEffect(() => { loadPeople(); loadForms(); }, []);

  async function handleRefreshForms() {
    setSyncing(true);
    await syncFormsFromMeta();
    await loadForms();
    setSyncing(false);
  }

  async function handleDelete() {
    const target = contacts.find(c => c.id === selId);
    if (!target) return;
    if (!window.confirm(`Delete “${target.profile_name}”?\n\nThis permanently removes the lead and any conversation history. This cannot be undone.`)) return;
    setDeleting(true);
    const res = await deletePersonLive(target.id);
    setDeleting(false);
    if (res.ok) {
      setContacts(cs => cs.filter(c => c.id !== target.id));
      setSelId(null);
    } else {
      alert('Could not delete this lead: ' + (res.error || 'unknown error'));
    }
  }

  async function handleAdd() {
    if (!addForm.phone.trim()) { setAddErr('Phone number is required.'); return; }
    const finalSource = addForm.source === 'Other' ? (addForm.customSource.trim() || 'Other') : addForm.source;
    setAdding(true); setAddErr('');
    const res = await addContactLive({ ...addForm, source: finalSource });
    setAdding(false);
    if (res.ok) {
      setShowAdd(false);
      setAddForm({ name: '', phone: '', email: '', company: '', source: 'Manual', customSource: '' });
      await loadPeople();
    } else {
      setAddErr(res.error || 'Could not add contact.');
    }
  }

  const formDef = forms.find(f => f.id === formId) || null;
  // When a form is selected, show only leads from that form.
  const visibleContacts = formDef ? contacts.filter(c => c.form_uuid === formId) : contacts;
  const sel = contacts.find(c => c.id === selId);

  const stdCols = `1.4fr 1fr 1.1fr .9fr .7fr 1.5fr`;
  const formCols = formDef ? formDef.fields.map(() => '1fr').join(' ') : '';
  const gridCols = formCols ? `${stdCols} ${formCols}` : stdCols;

  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <header style={{ padding: isMobile ? '18px 16px 14px' : '22px 28px 16px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: 'rgba(27,76,94,.45)' }}>COLLECTIONS</div>
            <h1 style={{ margin: '5px 0 0', fontSize: 22, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--brand-primary)' }}>People</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Form selector */}
            <div style={{ position: 'relative', flex: isMobile ? '1 1 100%' : 'none' }}>
              <button onClick={() => setShowFormDD(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid rgba(27,76,94,.18)', borderRadius: 10, padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: formDef ? 'var(--brand-primary)' : 'rgba(27,76,94,.5)', minWidth: isMobile ? '100%' : 200 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: formDef ? 'var(--brand-accent-soft)' : 'rgba(27,76,94,.3)', flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formDef ? formDef.name : 'All fields'}</span>
                <span style={{ color: 'rgba(27,76,94,.45)', display: 'flex', flexShrink: 0 }}><IconChevDown size={13} /></span>
              </button>
              {showFormDD && (
                <div style={{ position: 'absolute', top: '110%', left: 0, background: '#fff', border: '1px solid rgba(27,76,94,.14)', borderRadius: 11, boxShadow: '0 8px 24px rgba(14,58,53,.13)', zIndex: 50, minWidth: 250, overflow: 'hidden' }}>
                  <button onClick={() => { setFormId(''); setShowFormDD(false); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '11px 14px', background: !formId ? '#F2F8F2' : '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: !formId ? 700 : 500, color: 'var(--brand-primary)', borderBottom: '1px solid rgba(27,76,94,.06)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: !formId ? 'var(--brand-accent-soft)' : 'rgba(27,76,94,.25)' }} />
                    All contacts (standard columns)
                  </button>
                  {forms.map(f => (
                    <button key={f.id} onClick={() => { setFormId(f.id); setShowFormDD(false); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '11px 14px', background: f.id === formId ? '#F2F8F2' : '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: f.id === formId ? 700 : 500, color: 'var(--brand-primary)', borderBottom: '1px solid rgba(27,76,94,.06)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: f.id === formId ? 'var(--brand-accent-soft)' : 'rgba(27,76,94,.25)' }} />
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={handleRefreshForms} disabled={syncing} title="Pull latest forms from Meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid rgba(27,76,94,.16)', color: 'var(--brand-primary)', fontSize: 13, fontWeight: 700, padding: '9px 14px', borderRadius: 10, cursor: 'pointer' }}>
              <span style={{ width: 14, height: 14, display: 'flex' }}><IconRefresh size={14} /></span>
              {syncing ? 'Syncing…' : 'Refresh forms'}
            </button>
            <button onClick={() => { setShowAdd(true); setAddErr(''); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--brand-accent-soft)', border: 'none', color: 'var(--brand-primary-dark)', fontSize: 13, fontWeight: 800, padding: '10px 16px', borderRadius: 10, cursor: 'pointer' }}>
              <IconPlus size={15} /> Add Contact
            </button>
          </div>
        </header>

        <div style={{ padding: isMobile ? '0 16px 28px' : '0 28px 36px', overflowX: 'auto' }}>
          <div style={{ background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 14, overflow: 'hidden', minWidth: isMobile ? 680 : 'auto' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 10, padding: '12px 18px', background: '#F6FAF6', borderBottom: '1px solid rgba(27,76,94,.08)', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: 'rgba(27,76,94,.5)' }}>
              <span>NAME</span>
              <span>PHONE</span>
              <span>STATUS</span>
              <span>SCORE</span>
              <span>SOURCE</span>
              <span>RECEIVED</span>
              {formDef && formDef.fields.map(f => <span key={f.key}>{f.label.toUpperCase()}</span>)}
            </div>

            {loading && <div style={{ padding: '24px 18px', fontSize: 13, color: 'rgba(27,76,94,.5)' }}>Loading people…</div>}
            {!loading && visibleContacts.length === 0 && (
              <div style={{ padding: '26px 18px', fontSize: 13, color: 'rgba(27,76,94,.55)', lineHeight: 1.6 }}>
                No leads yet{formDef ? ' for this form' : ''}. New Meta leads land here automatically once your n8n workflow is live.
              </div>
            )}
            {visibleContacts.map(p => (
              <div key={p.id} onClick={() => setSelId(p.id === selId ? null : p.id)} style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 10, padding: '12px 18px', alignItems: 'center', borderBottom: '1px solid rgba(27,76,94,.06)', cursor: 'pointer', fontSize: 12.5, color: 'rgba(27,76,94,.7)', background: p.id === selId ? '#F2F8F2' : 'transparent' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: p.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{p.profile_name.charAt(0)}</span>
                  <span style={{ fontWeight: 700, color: 'var(--brand-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.profile_name}</span>
                  <TemperatureTag temp={p.temperature} override={p.temperature_override} />
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.phone}</span>
                <span><span style={leadChip(p.lead_status)}>{p.lead_status}</span></span>
                <span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{p.lead_score}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.source}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.received}>{p.received}</span>
                {formDef && formDef.fields.map(f => (
                  <span key={f.key} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(p.attributes || {})[f.key] || '-'}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Slide-in contact panel */}
      {sel && (
        <div className="fade-up" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: isMobile ? 'min(330px,92vw)' : 320, background: '#fff', borderLeft: '1px solid rgba(27,76,94,.12)', boxShadow: '-8px 0 24px rgba(14,58,53,.1)', overflowY: 'auto', zIndex: 20 }}>
          <div style={{ padding: '14px 18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={handleDelete} disabled={deleting} title="Delete this lead" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid rgba(199,80,59,.28)', background: '#FDECEA', cursor: deleting ? 'default' : 'pointer', color: '#C7503B', fontSize: 12.5, fontWeight: 700, opacity: deleting ? 0.6 : 1 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/></svg>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button onClick={() => setSelId(null)} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#F2F6F3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.55)' }}>
              <IconX size={15} />
            </button>
          </div>
          <div style={{ padding: '6px 18px 16px', textAlign: 'center', borderBottom: '1px solid rgba(27,76,94,.08)' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: sel.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, margin: '0 auto 10px' }}>
              {sel.profile_name.charAt(0)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--brand-primary)' }}>{sel.profile_name}</span>
              <TemperatureTag
                temp={sel.temperature} override={sel.temperature_override}
                contactId={sel.id} editable size="md"
                onChange={(t, o) => setContacts(cs => cs.map(c => c.id === sel.id ? { ...c, temperature: t, temperature_override: o } : c))}
              />
            </div>
            <div style={{ fontSize: 12, color: 'rgba(27,76,94,.55)', marginTop: 2 }}>{sel.jobTitle !== '-' ? `${sel.jobTitle} · ` : ''}{sel.company !== '-' ? sel.company : ''}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginTop: 13 }}>
              {[{ Icon: IconMail }, { Icon: IconPhone }, { Icon: IconWhatsApp }, { Icon: IconZap }].map(({ Icon }, i) => (
                <span key={i} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(27,76,94,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(27,76,94,.6)' }}>
                  <Icon size={15} />
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <div style={{ flex: 1, background: '#F2F8F2', border: '1px solid rgba(27,76,94,.10)', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)' }}>LEAD SCORE</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--brand-primary)', marginTop: 2 }}>{sel.lead_score}</div>
              </div>
              <div style={{ flex: 1, background: '#F2F8F2', border: '1px solid rgba(27,76,94,.10)', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)' }}>
                  {pipelineOf(sel.lead_status) === 'deal' ? 'DEAL VALUE' : 'STATUS'}
                </div>
                {pipelineOf(sel.lead_status) === 'deal'
                  ? <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--brand-primary)', marginTop: 3 }}>{formatCr(sel.deal_value_cr, { dash: 'Not set' })}</div>
                  : <div style={{ marginTop: 4 }}><span style={leadChip(sel.lead_status)}>{sel.lead_status}</span></div>}
              </div>
            </div>
          </div>

          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(27,76,94,.08)' }}>
            <PipelineMover
              contactId={sel.id}
              stage={sel.lead_status}
              dealValue={sel.deal_value_cr}
              dealValueIsManual={sel.deal_value_is_manual}
              compact
              onMoved={(s, p) => setContacts(cs => cs.map(c => c.id === sel.id ? { ...c, lead_status: s, pipeline: p } : c))}
              onValueChange={(v, m) => setContacts(cs => cs.map(c => c.id === sel.id ? { ...c, deal_value_cr: v, deal_value_is_manual: m } : c))}
            />
          </div>
          <div style={{ padding: '14px 18px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: 'var(--brand-primary)', marginBottom: 10 }}>CONTACT DETAILS</div>
            {[
              { label: 'Name',       value: sel.profile_name },
              { label: 'First Name', value: sel.firstName },
              { label: 'Last Name',  value: sel.lastName },
              { label: 'Email',     value: sel.email },
              { label: 'Phone',     value: sel.phone },
              { label: 'Company',   value: sel.company !== '-' ? sel.company : null },
              { label: 'Job Title', value: sel.jobTitle !== '-' ? sel.jobTitle : null },
              { label: 'Source',    value: sel.source },
            ].filter(f => f.value).map(f => (
              <div key={f.label} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(27,76,94,.45)', marginBottom: 3 }}>{f.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(27,76,94,.13)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, color: 'var(--brand-primary)', fontWeight: 500 }}>
                  <span>{f.value}</span>
                  <span style={{ color: 'rgba(27,76,94,.3)', display: 'flex', flexShrink: 0, marginLeft: 6 }}><IconEdit size={12} /></span>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 14 }}><LeadAnswers attributes={sel.attributes} /></div>
            <div style={{ borderTop: '1px solid rgba(27,76,94,.08)', paddingTop: 16, marginTop: 16 }}>
              <LeadProperties contactId={sel.id} lead={sel} />
            </div>
            <div style={{ borderTop: '1px solid rgba(27,76,94,.08)', paddingTop: 16, marginTop: 16 }}>
              <ContactNotes contactId={sel.id} />
            </div>
          </div>
        </div>
      )}

      {showFormDD && <div onClick={() => setShowFormDD(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}

      {/* Add Contact modal */}
      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,58,53,.42)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} className="fade-up" style={{ background: '#fff', borderRadius: 16, width: 'min(440px,94vw)', padding: '22px 24px 24px', boxShadow: '0 24px 60px rgba(14,58,53,.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--brand-primary)' }}>Add Contact</span>
              <button onClick={() => setShowAdd(false)} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#F2F6F3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.55)' }}><IconX size={15} /></button>
            </div>
            {addErr && <div style={{ background: '#FDECEA', color: '#C7503B', fontSize: 12.5, fontWeight: 600, padding: '9px 11px', borderRadius: 8, marginBottom: 14 }}>{addErr}</div>}
            {[
              { k: 'name', label: 'Name', ph: 'Full name' },
              { k: 'phone', label: 'Phone (WhatsApp) *', ph: '+91 98765 43210' },
              { k: 'email', label: 'Email', ph: 'name@company.com' },
              { k: 'company', label: 'Company', ph: 'Company name' },
            ].map(f => (
              <div key={f.k} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-primary)', marginBottom: 5, display: 'block' }}>{f.label}</label>
                <input value={addForm[f.k]} onChange={e => setAddForm({ ...addForm, [f.k]: e.target.value })} placeholder={f.ph} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.18)', borderRadius: 9, padding: '10px 12px', fontSize: 13, color: 'var(--brand-primary)', outline: 'none', fontFamily: 'inherit' }} />
              </div>
            ))}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-primary)', marginBottom: 5, display: 'block' }}>Lead Source</label>
              <select value={addForm.source} onChange={e => setAddForm({ ...addForm, source: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.18)', borderRadius: 9, padding: '10px 12px', fontSize: 13, color: 'var(--brand-primary)', outline: 'none', fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}>
                {['Meta Lead Ads', 'Google Ads', 'Website', 'Referral', 'WhatsApp', 'Manual', 'Other'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {addForm.source === 'Other' && (
                <input autoFocus value={addForm.customSource} onChange={e => setAddForm({ ...addForm, customSource: e.target.value })} placeholder="Type the source (e.g. LinkedIn, Event, Cold call)"
                  style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, border: '1px solid rgba(27,76,94,.18)', borderRadius: 9, padding: '10px 12px', fontSize: 13, color: 'var(--brand-primary)', outline: 'none', fontFamily: 'inherit' }} />
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setShowAdd(false)} style={{ border: '1px solid rgba(27,76,94,.16)', background: '#fff', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAdd} disabled={adding} style={{ border: 'none', background: 'var(--brand-accent-soft)', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 800, color: 'var(--brand-primary-dark)', cursor: adding ? 'default' : 'pointer', opacity: adding ? 0.6 : 1 }}>{adding ? 'Adding…' : 'Add Contact'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '../useIsMobile';
import { IconPlus, IconX, IconRefresh, IconClip } from '../icons';
import {
  getCampaigns, getCampaign, createCampaign, pauseCampaign, retryCampaignFailed, previewAudience,
  getTemplatesLive, templateVars, uploadHeaderImage, QUALIFICATIONS, QUALIFICATION_LABELS,
  createCampaignFromCsv,
} from '../liveData';
import { parseCsv, downloadSampleCsv, SAMPLE_HEADERS } from '../csv';
import { LEAD_STAGES, DEAL_STAGES, TEMPERATURES, tempStyle } from '../pipeline';

const FOREST = 'var(--brand-primary)';


const CAMP_STATUS = {
  draft: { bg: 'rgba(27,76,94,.08)', fg: 'rgba(27,76,94,.6)' },
  sending: { bg: '#EAF7EC', fg: '#2E7D44' },
  paused: { bg: '#FFF1DC', fg: '#B6743A' },
  completed: { bg: 'rgba(27,76,94,.10)', fg: 'var(--brand-primary)' },
};
const DELIV = {
  queued: { bg: '#FFF7E8', fg: '#B6743A', label: 'Queued' },
  retry: { bg: '#FFF1DC', fg: '#B6743A', label: 'Retrying' },
  sent: { bg: 'rgba(27,76,94,.08)', fg: 'rgba(27,76,94,.7)', label: 'Sent' },
  delivered: { bg: '#EAF7EC', fg: '#2E7D44', label: 'Delivered' },
  read: { bg: '#E4F5E9', fg: '#1E7D3E', label: 'Read' },
  failed: { bg: '#FDECEA', fg: '#C7503B', label: 'Failed' },
};
const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.18)', borderRadius: 9, padding: '10px 12px', fontSize: 13.5, color: FOREST, outline: 'none', fontFamily: 'inherit', background: '#fff' };
const labelStyle = { fontSize: 11.5, fontWeight: 700, color: 'rgba(27,76,94,.6)', display: 'block', marginBottom: 6 };

// Human "in 3h", "in 12m", "any moment" for a future ISO timestamp.
function fromNow(iso) {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 60 * 1000) return 'any moment';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  return `in ${Math.round(hrs / 24)}d`;
}

// Short absolute time, e.g. "11 Jul, 3:04 PM".
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}

// One recipient. A failure gets an explicit (i) button rather than only an
// expandable row: when a send fails the first question is always "who was that
// meant for", and the answer has to be one tap away, not hidden behind knowing
// the row is expandable.
function RecipientRow({ r }) {
  const [open, setOpen] = useState(false);
  const d = DELIV[r.delivery] || DELIV.queued;
  const log = Array.isArray(r.attempt_log) ? r.attempt_log : [];
  const recovered = (r.attempts || 0) > 1 && r.delivery !== 'failed' && ['sent', 'delivered', 'read'].includes(r.delivery);
  const gaveUp = (r.attempts || 0) > 1 && r.delivery === 'failed';
  const delivered = ['sent', 'delivered', 'read'].includes(r.delivery);
  const failed = r.delivery === 'failed';
  const canExpand = log.length > 0 || failed;
  // Only show the raw attempt counter when it adds information — i.e. not for a
  // clean first-try success, and not when a recovered/gave-up phrase already says it.
  const showAttempts = (r.attempts || 0) > 0 && !recovered && !gaveUp && !(delivered && (r.attempts || 0) <= 1);

  const displayName = r.full_name || r.first_name || null;

  // What actually happened, in words rather than a status code.
  const outcome = failed
    ? (r.error || 'WhatsApp rejected this message.')
    : r.delivery === 'read'      ? 'Delivered and read on WhatsApp.'
    : r.delivery === 'delivered' ? 'Delivered to their phone.'
    : r.delivery === 'sent'      ? 'Accepted by WhatsApp, waiting on delivery.'
    : r.status === 'retry'       ? 'Failed once, queued to try again.'
    : 'Queued, not sent yet.';

  return (
    <div style={{ background: '#fff', border: `1px solid ${failed ? 'rgba(199,80,59,.22)' : 'rgba(27,76,94,.08)'}`, borderRadius: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 12px' }}>
        <div onClick={() => canExpand && setOpen((o) => !o)} style={{ minWidth: 0, flex: 1, cursor: canExpand ? 'pointer' : 'default' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: FOREST, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {canExpand && <span style={{ color: 'rgba(27,76,94,.4)', marginRight: 5 }}>{open ? '▾' : '▸'}</span>}
            {displayName || r.wa_id}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(27,76,94,.45)' }}>
            {r.wa_id}
            {showAttempts ? ` · attempt ${r.attempts}${r.max_attempts ? `/${r.max_attempts}` : ''}` : ''}
            {recovered ? <span style={{ color: '#2E7D44', fontWeight: 700 }}> · recovered on try {r.attempts}</span> : null}
            {gaveUp ? <span style={{ color: '#C7503B', fontWeight: 700 }}> · gave up after {r.attempts} tries</span> : null}
            {r.status === 'retry' && r.next_attempt_at ? ` · retry ${fromNow(r.next_attempt_at)}` : ''}
          </div>
        </div>

        {failed && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Why this failed"
            title="Why this failed"
            style={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', border: '1px solid rgba(199,80,59,.35)',
              background: open ? '#C7503B' : '#FDECEA', color: open ? '#fff' : '#C7503B', cursor: 'pointer',
              fontFamily: 'Georgia, serif', fontSize: 14, fontWeight: 700, fontStyle: 'italic', lineHeight: 1, padding: 0 }}>
            i
          </button>
        )}
        <span style={{ fontSize: 11, fontWeight: 700, color: d.fg, background: d.bg, padding: '3px 10px', borderRadius: 999, flexShrink: 0 }}>{d.label}</span>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid rgba(27,76,94,.06)', padding: '9px 12px 11px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ fontSize: 11.5, lineHeight: 1.5, color: failed ? '#A23B2A' : 'rgba(27,76,94,.65)' }}>
            <strong style={{ color: failed ? '#A23B2A' : FOREST }}>{failed ? 'Why it failed: ' : 'Outcome: '}</strong>
            {outcome}
          </div>

          {/* Who it was meant for — the first thing anyone asks about a failure. */}
          <div style={{ fontSize: 11, color: 'rgba(27,76,94,.6)', lineHeight: 1.55, background: '#F6FAF6', borderRadius: 7, padding: '7px 9px' }}>
            <div>Intended for <strong style={{ color: FOREST }}>{displayName || 'an unnamed contact'}</strong> on <strong style={{ color: FOREST }}>{r.wa_id}</strong></div>
            {r.email && <div>Email on file: {r.email}</div>}
            {Array.isArray(r.variables) && r.variables.length > 0 && (
              <div style={{ marginTop: 3 }}>
                Values sent: {r.variables.map((v, i) => `{{${i + 1}}} ${v || '-'}`).join(' · ')}
              </div>
            )}
          </div>

          {log.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'baseline' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: a.ok ? '#2E7D44' : '#C7503B', flexShrink: 0, marginTop: 3 }} />
              <span style={{ fontWeight: 700, color: FOREST, flexShrink: 0 }}>Try {a.n ?? i + 1}</span>
              <span style={{ color: 'rgba(27,76,94,.5)', flexShrink: 0 }}>{fmtTime(a.at)}</span>
              <span style={{ color: a.ok ? '#2E7D44' : '#C7503B' }}>
                {a.ok ? 'sent' : `failed${a.code ? ` (#${a.code})` : ''}${a.error ? `: ${a.error}` : ''}`}
              </span>
            </div>
          ))}

          {r.status === 'retry' && r.next_attempt_at && (
            <div style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'baseline', opacity: 0.7 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: '#B6743A', flexShrink: 0, marginTop: 3 }} />
              <span style={{ fontWeight: 700, color: '#B6743A', flexShrink: 0 }}>Next</span>
              <span style={{ color: 'rgba(27,76,94,.5)' }}>{fmtTime(r.next_attempt_at)} ({fromNow(r.next_attempt_at)})</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: '#F6FAF6', border: '1px solid rgba(27,76,94,.08)', borderRadius: 10, padding: '10px 14px', flex: 1, minWidth: 78 }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: color || FOREST }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(27,76,94,.5)' }}>{label}</div>
    </div>
  );
}

export default function Campaigns() {
  const isMobile = useIsMobile();
  const [list, setList] = useState(null);
  const [building, setBuilding] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const load = () => getCampaigns().then(setList);
  useEffect(() => { load(); }, []);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--app-bg)' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: isMobile ? '16px 12px 32px' : '26px 28px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: isMobile ? 19 : 22, fontWeight: 800, color: FOREST }}>Campaigns</div>
            <div style={{ fontSize: 13, color: 'rgba(27,76,94,.55)' }}>Send an approved template to a segment of your leads</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <motion.button whileTap={{ scale: 0.96 }} onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid rgba(27,76,94,.18)', color: FOREST, fontSize: 13, fontWeight: 700, padding: '9px 14px', borderRadius: 10, cursor: 'pointer' }}><IconRefresh size={14} /> Refresh</motion.button>
            <motion.button whileTap={{ scale: 0.96 }} onClick={() => setBuilding(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--brand-primary)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 800, padding: '9px 16px', borderRadius: 10, cursor: 'pointer' }}><IconPlus size={14} /> New campaign</motion.button>
          </div>
        </div>

        {!list ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'rgba(27,76,94,.5)' }}>Loading…</div>
        ) : list.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'rgba(27,76,94,.55)', fontSize: 14 }}>No campaigns yet. Click <b>New campaign</b> to send your first bulk template.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((c) => {
              const st = CAMP_STATUS[c.status] || CAMP_STATUS.draft;
              return (
                <button key={c.id} onClick={() => setDetailId(c.id)} style={{ textAlign: 'left', background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 14, padding: isMobile ? 14 : '16px 18px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: FOREST }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'rgba(27,76,94,.5)', marginTop: 2 }}>Template: {c.template_name} · {new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'capitalize', color: st.fg, background: st.bg, padding: '4px 11px', borderRadius: 999 }}>{c.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12.5, color: 'rgba(27,76,94,.7)', flexWrap: 'wrap' }}>
                    <span><b style={{ color: FOREST }}>{c.total}</b> total</span>
                    <span style={{ color: '#2E7D44' }}><b>{c.sent}</b> sent</span>
                    <span style={{ color: '#B6743A' }}><b>{c.queued}</b> pending</span>
                    <span style={{ color: '#C7503B' }}><b>{c.failed}</b> failed</span>
                    {c.retrying > 0 && <span style={{ color: '#B6743A' }}>↻ <b>{c.retrying}</b> retrying</span>}
                  </div>
                  {(c.recovered > 0 || c.gaveUp > 0) && (
                    <div style={{ marginTop: 7, fontSize: 11.5, color: 'rgba(27,76,94,.6)' }}>
                      Retry results: {[
                        c.recovered > 0 ? `${c.recovered} recovered` : null,
                        c.gaveUp > 0 ? `${c.gaveUp} still failed` : null,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {building && <Builder isMobile={isMobile} onClose={() => setBuilding(false)} onDone={() => { setBuilding(false); load(); }} />}
        {detailId && <Detail id={detailId} isMobile={isMobile} onClose={() => { setDetailId(null); load(); }} />}
      </AnimatePresence>
    </div>
  );
}

function Modal({ children, onClose, isMobile }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(14,58,53,.4)', zIndex: 400, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}>
      <motion.div initial={{ y: isMobile ? '100%' : 20, opacity: isMobile ? 1 : 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: isMobile ? '100%' : 20, opacity: isMobile ? 1 : 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--app-bg)', width: isMobile ? '100%' : 560, maxWidth: '100%', maxHeight: isMobile ? '92vh' : '88vh', overflowY: 'auto', borderRadius: isMobile ? '20px 20px 0 0' : 18, padding: 22 }}>
        {children}
      </motion.div>
    </motion.div>
  );
}

function Chip({ on, onClick, children }) {
  return (
    <button onClick={onClick} style={{ fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 999, cursor: 'pointer', border: '1px solid ' + (on ? FOREST : 'rgba(27,76,94,.16)'), background: on ? FOREST : '#fff', color: on ? '#fff' : 'rgba(27,76,94,.7)' }}>{children}</button>
  );
}

function Builder({ onClose, onDone, isMobile }) {
  const [name, setName] = useState('');
  const [templates, setTemplates] = useState([]);
  const [tpl, setTpl] = useState(null);      // selected template object
  const [vars, setVars] = useState([]);      // variable values
  const [headerImage, setHeaderImage] = useState(''); // uploaded image URL for IMAGE-header templates
  const [imgUploading, setImgUploading] = useState(false);
  const imgInputRef = useRef(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [quals, setQuals] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [temps, setTemps] = useState([]);
  const [segment, setSegment] = useState('all'); // 'all' | 'new' | 'old' (imported)
  const [count, setCount] = useState(null);
  const [maxRetries, setMaxRetries] = useState(3);
  // 'filter' targets the CRM; 'csv' targets an uploaded list and ignores the
  // filters entirely — the file IS the audience.
  const [audienceSource, setAudienceSource] = useState('filter');
  const [csv, setCsv] = useState(null);       // parseCsv result
  const [csvName, setCsvName] = useState('');
  const csvInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { getTemplatesLive().then((t) => setTemplates((t || []).filter((x) => x.status === 'Approved'))); }, []);

  const filters = () => ({ date_from: dateFrom || null, date_to: dateTo || null, qualifications: quals, lead_statuses: statuses, temperatures: temps, segment });

  function selectTpl(name) {
    const t = templates.find((x) => x.name === name) || null;
    setTpl(t);
    setHeaderImage('');
    const n = t ? templateVars(t.body || '') : 0;
    setVars(Array.from({ length: n }, (_, i) => (i === 0 ? '{{first_name}}' : '')));
  }
  const needsImage = (tpl?.header_type || '').toUpperCase() === 'IMAGE';

  async function onImageFile(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setErr(''); setImgUploading(true);
    const res = await uploadHeaderImage(f);
    setImgUploading(false);
    if (res.ok) setHeaderImage(res.url); else setErr(res.error || 'Image upload failed');
  }

  async function preview() { setCount('…'); setCount(await previewAudience(filters())); }

  async function onCsvFile(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setErr('');
    const text = await f.text();
    const parsed = parseCsv(text);
    if (!parsed.ok) { setCsv(null); setCsvName(''); setErr(parsed.error); return; }
    setCsv(parsed); setCsvName(f.name);
  }

  async function submit() {
    setErr('');
    if (!name.trim()) return setErr('Give the campaign a name.');
    if (!tpl) return setErr('Pick a template.');
    if (needsImage && !headerImage.trim()) return setErr('This template has an image header. Add a header image URL.');
    if (audienceSource === 'csv' && !csv) return setErr('Upload a CSV, or switch back to filtering your leads.');

    setBusy(true);
    const common = {
      name: name.trim(), template_name: tpl.name, template_language: tpl.language,
      header_image: needsImage ? headerImage.trim() : null, maxRetries,
    };
    const res = audienceSource === 'csv'
      ? await createCampaignFromCsv({ ...common, rows: csv.rows, csv_columns: csv.variableColumns, variable_count: vars.length })
      : await createCampaign({ ...common, variables: vars, filters: filters() });
    setBusy(false);
    if (res.ok) { alert(`Campaign started, sending to ${res.count} people. It sends in batches; check the campaign for live progress.`); onDone(); }
    else setErr(res.error || 'Failed to create campaign.');
  }

  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <Modal onClose={onClose} isMobile={isMobile}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: FOREST }}>New campaign</div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(27,76,94,.5)' }}><IconX size={16} /></button>
      </div>

      <label style={labelStyle}>Campaign name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. July re-engagement" style={{ ...inputStyle, marginBottom: 16 }} />

      <label style={labelStyle}>Template (approved only)</label>
      <select value={tpl?.name || ''} onChange={(e) => selectTpl(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }}>
        <option value="" disabled>Choose a template…</option>
        {templates.map((t) => <option key={t.name} value={t.name}>{t.name} ({t.language})</option>)}
      </select>
      {tpl && (tpl.body ? <div style={{ fontSize: 12, color: 'rgba(27,76,94,.6)', background: '#fff', border: '1px solid rgba(27,76,94,.1)', borderRadius: 9, padding: '10px 12px', marginBottom: 12, lineHeight: 1.5 }}>{tpl.body}</div> : null)}
      {needsImage && (
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Header image (this template needs an image)</label>
          <input ref={imgInputRef} type="file" accept="image/*" onChange={onImageFile} style={{ display: 'none' }} />
          <button onClick={() => imgInputRef.current?.click()} disabled={imgUploading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px dashed rgba(27,76,94,.35)', color: FOREST, fontSize: 13, fontWeight: 700, padding: '10px 14px', borderRadius: 9, cursor: imgUploading ? 'default' : 'pointer' }}>
            <IconClip size={16} /> {imgUploading ? 'Uploading…' : (headerImage ? 'Change image' : 'Upload image')}
          </button>
          {headerImage && <img src={headerImage} alt="" style={{ marginTop: 8, display: 'block', maxWidth: '100%', maxHeight: 130, borderRadius: 8, objectFit: 'cover' }} />}
        </div>
      )}
      {vars.map((v, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <label style={labelStyle}>{`Variable {{${i + 1}}}`}{i === 0 ? ' (tip: {{first_name}} auto-fills each lead’s first name)' : ''}</label>
          <input value={v} onChange={(e) => setVars(vars.map((x, j) => j === i ? e.target.value : x))} style={inputStyle} />
        </div>
      ))}

      <div style={{ height: 1, background: 'rgba(27,76,94,.1)', margin: '16px 0' }} />
      <div style={{ fontSize: 13, fontWeight: 800, color: FOREST, marginBottom: 12 }}>Audience</div>

      {/* Two ways to build a list, and they are mutually exclusive: a CSV IS
          the audience, so the CRM filters below do not apply to it. */}
      <div style={{ display: 'flex', gap: 3, background: '#F2F6F3', border: '1px solid rgba(27,76,94,.12)', borderRadius: 10, padding: 3, marginBottom: 16 }}>
        {[{ k: 'filter', t: 'My leads', s: 'Filter the CRM' }, { k: 'csv', t: 'Upload a CSV', s: 'Use your own list' }].map((o) => {
          const on = audienceSource === o.k;
          return (
            <button key={o.k} type="button" onClick={() => { setAudienceSource(o.k); setErr(''); }}
              style={{ flex: 1, padding: '9px 6px', minHeight: 44, borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', lineHeight: 1.25, background: on ? FOREST : 'transparent', color: on ? '#fff' : 'rgba(27,76,94,.65)' }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: on ? 800 : 600 }}>{o.t}</span>
              <span style={{ display: 'block', fontSize: 9.5, fontWeight: 600, opacity: on ? .75 : .55 }}>{o.s}</span>
            </button>
          );
        })}
      </div>

      {audienceSource === 'csv' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Contact list</label>
            <button type="button" onClick={() => downloadSampleCsv()}
              style={{ background: 'transparent', border: 'none', color: 'var(--brand-muted)', fontFamily: 'inherit',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '8px 6px', margin: '-8px -6px', minHeight: 38 }}>
              Download sample CSV
            </button>
          </div>

          <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={onCsvFile} style={{ display: 'none' }} />
          <button type="button" onClick={() => csvInputRef.current?.click()}
            style={{ width: '100%', minHeight: 52, border: '1.5px dashed rgba(27,76,94,.28)', borderRadius: 11,
              background: csv ? '#F2F8F2' : '#fff', color: FOREST, fontFamily: 'inherit', fontSize: 13.5,
              fontWeight: 700, cursor: 'pointer', padding: '12px 14px' }}>
            {csv ? 'Replace ' + csvName : 'Choose a CSV file'}
          </button>

          <div style={{ fontSize: 11, color: 'rgba(27,76,94,.5)', lineHeight: 1.5, marginTop: 8 }}>
            Needs a phone column. Columns named {SAMPLE_HEADERS.slice(3).join(', ')} become your template variables, in order.
            A 10-digit number is treated as Indian and gets +91.
          </div>

          {csv && (
            <div style={{ marginTop: 12, border: '1px solid rgba(27,76,94,.12)', borderRadius: 11, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', padding: '11px 13px', background: '#F6FAF6', borderBottom: '1px solid rgba(27,76,94,.08)' }}>
                <strong style={{ fontSize: 15, fontWeight: 800, color: FOREST }}>{csv.rows.length}</strong>
                <span style={{ fontSize: 12.5, color: 'rgba(27,76,94,.6)' }}>contacts</span>
                <span style={{ color: 'rgba(27,76,94,.25)' }}>|</span>
                <strong style={{ fontSize: 15, fontWeight: 800, color: FOREST }}>{csv.variableCount}</strong>
                <span style={{ fontSize: 12.5, color: 'rgba(27,76,94,.6)' }}>
                  {csv.variableCount === 1 ? 'variable' : 'variables'} found
                </span>
              </div>

              <div style={{ padding: '11px 13px', fontSize: 11.5, color: 'rgba(27,76,94,.6)', lineHeight: 1.6 }}>
                <div>Phone from <strong style={{ color: FOREST }}>{csv.mapped.phone}</strong>
                  {csv.mapped.name && <> · name from <strong style={{ color: FOREST }}>{csv.mapped.name}</strong></>}
                  {csv.mapped.email && <> · email from <strong style={{ color: FOREST }}>{csv.mapped.email}</strong></>}
                </div>
                {csv.variableColumns.map((c, i) => (
                  <div key={c}>{'{{' + (i + 1) + '}}'} from <strong style={{ color: FOREST }}>{c}</strong>
                    <span style={{ color: 'rgba(27,76,94,.42)' }}> e.g. {csv.rows[0].variables[i] || '-'}</span>
                  </div>
                ))}
              </div>

              {/* The template decides how many variables it needs; the file
                  decides how many it has. A mismatch is rejected by Meta at
                  send time, so say so here instead. */}
              {tpl && csv.variableCount !== vars.length && (
                <div style={{ padding: '10px 13px', fontSize: 11.5, lineHeight: 1.5, background: '#FFF1DC', color: '#8A5E22', borderTop: '1px solid rgba(27,76,94,.08)' }}>
                  This template takes <strong>{vars.length}</strong> {vars.length === 1 ? 'variable' : 'variables'} but the file has <strong>{csv.variableCount}</strong>.
                  {csv.variableCount > vars.length
                    ? ' The extra columns are ignored — the campaign still sends.'
                    : ' The missing ones send as “-” rather than blocking the campaign.'}
                </div>
              )}

              {csv.skipped.length > 0 && (
                <div style={{ padding: '10px 13px', fontSize: 11.5, lineHeight: 1.5, background: '#FDECEA', color: '#A23B2A', borderTop: '1px solid rgba(27,76,94,.08)' }}>
                  <strong>{csv.skipped.length} {csv.skipped.length === 1 ? 'row' : 'rows'} skipped.</strong> {csv.skipped.slice(0, 3).join(' | ')}
                  {csv.skipped.length > 3 && ' and ' + (csv.skipped.length - 3) + ' more'}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {audienceSource === 'filter' && (<>
      <label style={labelStyle}>Lead age</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {[{ k: 'all', l: 'All leads' }, { k: 'new', l: 'New leads' }, { k: 'old', l: 'Old / imported leads' }].map((o) => (
          <Chip key={o.k} on={segment === o.k} onClick={() => setSegment(o.k)}>{o.l}</Chip>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 130 }}><label style={labelStyle}>Received from</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} /></div>
        <div style={{ flex: 1, minWidth: 130 }}><label style={labelStyle}>Received to</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} /></div>
      </div>

      <label style={labelStyle}>Qualification</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {QUALIFICATIONS.map((q) => <Chip key={q} on={quals.includes(q)} onClick={() => toggle(quals, setQuals, q)}>{QUALIFICATION_LABELS[q]}</Chip>)}
      </div>

      {/* Targeting by tag is the fastest way to build a useful list — a blast to
          every Hot lead is a real campaign, a blast to every lead is not. */}
      <label style={labelStyle}>Tag</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {TEMPERATURES.map((t) => (
          <Chip key={t} on={temps.includes(t)} onClick={() => toggle(temps, setTemps, t)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: tempStyle(t).dot }} />
              {tempStyle(t).label}
            </span>
          </Chip>
        ))}
      </div>

      <label style={labelStyle}>Lead status <span style={{ fontWeight: 500, color: 'rgba(27,76,94,.4)' }}>· before the call</span></label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {LEAD_STAGES.map((s) => <Chip key={s} on={statuses.includes(s)} onClick={() => toggle(statuses, setStatuses, s)}>{s}</Chip>)}
      </div>

      <label style={labelStyle}>Deal stage <span style={{ fontWeight: 500, color: 'rgba(27,76,94,.4)' }}>· after the call</span></label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {DEAL_STAGES.map((s) => <Chip key={s} on={statuses.includes(s)} onClick={() => toggle(statuses, setStatuses, s)}>{s}</Chip>)}
      </div>

      </>)}

      <label style={labelStyle}>Retries on failure</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {[1, 2, 3].map((n) => <Chip key={n} on={maxRetries === n} onClick={() => setMaxRetries(n)}>{n} {n === 1 ? 'retry' : 'retries'}</Chip>)}
      </div>
      <div style={{ fontSize: 11, color: 'rgba(27,76,94,.45)', marginBottom: 16, lineHeight: 1.5 }}>How many extra attempts to make for anyone who fails (e.g. Meta rate-caps), spread over ~24h.</div>

      <div style={{ display: audienceSource === 'csv' ? 'none' : 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={preview} style={{ background: '#fff', border: '1px solid rgba(27,76,94,.18)', color: FOREST, fontSize: 12.5, fontWeight: 700, padding: '9px 14px', borderRadius: 9, cursor: 'pointer' }}>Preview recipients</button>
        {count !== null && <span style={{ fontSize: 13, fontWeight: 700, color: FOREST }}>{count} {count === 1 ? 'person' : 'people'}{(!dateFrom && !dateTo && !quals.length && !statuses.length && !temps.length) ? ' (everyone)' : ''}</span>}
      </div>

      {err && <div style={{ fontSize: 12.5, color: '#C0392B', marginBottom: 12 }}>{err}</div>}

      <button onClick={submit} disabled={busy} style={{ width: '100%', background: 'var(--brand-primary)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 800, padding: '13px', borderRadius: 11, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
        {busy ? 'Starting…' : 'Create & send'}
      </button>
      <div style={{ fontSize: 11, color: 'rgba(27,76,94,.45)', marginTop: 10, lineHeight: 1.5 }}>Sends an approved template to everyone matching the filters. Delivery is throttled; failed/rate-capped messages retry over 24h.</div>
    </Modal>
  );
}

function Detail({ id, onClose, isMobile }) {
  const [c, setC] = useState(null);
  const [retries, setRetries] = useState(3);
  const [retrying, setRetrying] = useState(false);
  const load = () => getCampaign(id).then(setC);
  useEffect(() => { load(); }, [id]);

  async function togglePause() {
    if (!c) return;
    await pauseCampaign(id, c.status === 'sending');
    load();
  }

  async function retryFailed() {
    if (!c || retrying) return;
    setRetrying(true);
    const res = await retryCampaignFailed(id, retries);
    setRetrying(false);
    if (res.ok) load();
    else alert(res.error || 'Could not retry.');
  }

  return (
    <Modal onClose={onClose} isMobile={isMobile}>
      {!c ? <div style={{ padding: 30, textAlign: 'center', color: 'rgba(27,76,94,.5)' }}>Loading…</div> : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div><div style={{ fontSize: 17, fontWeight: 800, color: FOREST }}>{c.name}</div>
              <div style={{ fontSize: 12, color: 'rgba(27,76,94,.5)', marginTop: 2 }}>Template: {c.template_name}</div></div>
            <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(27,76,94,.5)' }}><IconX size={16} /></button>
          </div>

          <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>
            <Stat label="TOTAL" value={c.total} />
            <Stat label="SENT" value={c.sent} color="#2E7D44" />
            <Stat label="PENDING" value={c.queued} color="#B6743A" />
            <Stat label="FAILED" value={c.failed} color="#C7503B" />
          </div>

          {(c.retrying > 0 || c.retryAttempts > 0) && (
            <div style={{ background: '#FFF8EC', border: '1px solid rgba(182,116,58,.2)', borderRadius: 11, padding: '11px 14px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <IconRefresh size={13} />
                <span style={{ fontSize: 12.5, fontWeight: 800, color: '#B6743A' }}>Retry activity</span>
              </div>
              <div style={{ fontSize: 11.8, color: 'rgba(27,76,94,.7)', lineHeight: 1.6 }}>
                {c.retryAttempts > 0 && <div><strong>{c.retryAttempts}</strong> retry attempt{c.retryAttempts > 1 ? 's' : ''} made so far.</div>}
                {c.recovered > 0 && <div style={{ color: '#2E7D44' }}>✓ <strong>{c.recovered}</strong> recovered, delivered on a retry.</div>}
                {c.gaveUp > 0 && <div style={{ color: '#C7503B' }}>✗ <strong>{c.gaveUp}</strong> still failed after retrying.</div>}
                {c.retrying > 0
                  ? <div><strong>{c.retrying}</strong> recipient{c.retrying > 1 ? 's' : ''} waiting to retry{c.nextRetryAt ? `, next ${fromNow(c.nextRetryAt)}` : ''}.</div>
                  : (c.retryAttempts > 0 && <div style={{ color: 'rgba(27,76,94,.5)' }}>All retries finished. Nothing else queued.</div>)}
              </div>
            </div>
          )}

          {(c.status === 'sending' || c.status === 'paused') && (
            <button onClick={togglePause} style={{ background: c.status === 'sending' ? '#FFF1DC' : '#EAF7EC', color: c.status === 'sending' ? '#B6743A' : '#2E7D44', border: 'none', fontSize: 12.5, fontWeight: 700, padding: '9px 14px', borderRadius: 9, cursor: 'pointer', marginBottom: 14, marginRight: 8 }}>
              {c.status === 'sending' ? 'Pause sending' : 'Resume sending'}
            </button>
          )}

          {c.failed > 0 && (
            <div style={{ background: '#FBECE8', border: '1px solid rgba(199,80,59,.18)', borderRadius: 11, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#C7503B', marginBottom: 8 }}>
                {c.failed} message{c.failed > 1 ? 's' : ''} didn’t get delivered
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(27,76,94,.6)', lineHeight: 1.5, marginBottom: 10 }}>
                Re-queue them for another try, spread over the next 24 hours. Meta rate-caps (error 131049) often clear on a later attempt.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, color: 'rgba(27,76,94,.7)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Retries
                  <select value={retries} onChange={(e) => setRetries(Number(e.target.value))} style={{ fontSize: 12.5, fontWeight: 700, color: FOREST, border: '1px solid rgba(27,76,94,.2)', borderRadius: 8, padding: '5px 8px', background: '#fff', cursor: 'pointer' }}>
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <button onClick={retryFailed} disabled={retrying} style={{ background: 'var(--brand-primary)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 800, padding: '9px 16px', borderRadius: 9, cursor: retrying ? 'default' : 'pointer', opacity: retrying ? 0.7 : 1 }}>
                  {retrying ? 'Re-queuing…' : `Retry ${c.failed} failed`}
                </button>
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(27,76,94,.55)', margin: '4px 0 8px' }}>RECIPIENTS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {c.recipients.map((r) => <RecipientRow key={r.id} r={r} />)}
          </div>
        </>
      )}
    </Modal>
  );
}

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '../useIsMobile';
import { IconPlus, IconX, IconRefresh, IconClip } from '../icons';
import {
  getCampaigns, getCampaign, createCampaign, pauseCampaign, retryCampaignFailed, previewAudience,
  getTemplatesLive, templateVars, uploadHeaderImage, QUALIFICATIONS, QUALIFICATION_LABELS,
} from '../liveData';
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

// One recipient — click to expand a per-attempt timeline (from attempt_log).
function RecipientRow({ r }) {
  const [open, setOpen] = useState(false);
  const d = DELIV[r.delivery] || DELIV.queued;
  const log = Array.isArray(r.attempt_log) ? r.attempt_log : [];
  const canExpand = log.length > 0;
  const recovered = (r.attempts || 0) > 1 && r.delivery !== 'failed' && ['sent', 'delivered', 'read'].includes(r.delivery);
  const gaveUp = (r.attempts || 0) > 1 && r.delivery === 'failed';
  const delivered = ['sent', 'delivered', 'read'].includes(r.delivery);
  // Only show the raw attempt counter when it adds information — i.e. not for a
  // clean first-try success, and not when a recovered/gave-up phrase already says it.
  const showAttempts = (r.attempts || 0) > 0 && !recovered && !gaveUp && !(delivered && (r.attempts || 0) <= 1);
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(27,76,94,.08)', borderRadius: 9 }}>
      <div onClick={() => canExpand && setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 12px', cursor: canExpand ? 'pointer' : 'default' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: FOREST, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {canExpand && <span style={{ color: 'rgba(27,76,94,.4)', marginRight: 5 }}>{open ? '▾' : '▸'}</span>}
            {r.first_name || r.wa_id}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(27,76,94,.45)' }}>
            {r.wa_id}
            {showAttempts ? ` · attempt ${r.attempts}${r.max_attempts ? `/${r.max_attempts}` : ''}` : ''}
            {recovered ? <span style={{ color: '#2E7D44', fontWeight: 700 }}> · recovered on try {r.attempts}</span> : null}
            {gaveUp ? <span style={{ color: '#C7503B', fontWeight: 700 }}> · gave up after {r.attempts} tries</span> : null}
            {r.status === 'retry' && r.next_attempt_at ? ` · retry ${fromNow(r.next_attempt_at)}` : ''}
            {r.error && !recovered ? ` · ${r.error}` : ''}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: d.fg, background: d.bg, padding: '3px 10px', borderRadius: 999, flexShrink: 0 }}>{d.label}</span>
      </div>
      {open && canExpand && (
        <div style={{ borderTop: '1px solid rgba(27,76,94,.06)', padding: '8px 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
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

  async function submit() {
    setErr('');
    if (!name.trim()) return setErr('Give the campaign a name.');
    if (!tpl) return setErr('Pick a template.');
    if (needsImage && !headerImage.trim()) return setErr('This template has an image header. Add a header image URL.');
    setBusy(true);
    const res = await createCampaign({ name: name.trim(), template_name: tpl.name, template_language: tpl.language, variables: vars, filters: filters(), header_image: needsImage ? headerImage.trim() : null, maxRetries });
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

      <label style={labelStyle}>Retries on failure</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {[1, 2, 3].map((n) => <Chip key={n} on={maxRetries === n} onClick={() => setMaxRetries(n)}>{n} {n === 1 ? 'retry' : 'retries'}</Chip>)}
      </div>
      <div style={{ fontSize: 11, color: 'rgba(27,76,94,.45)', marginBottom: 16, lineHeight: 1.5 }}>How many extra attempts to make for anyone who fails (e.g. Meta rate-caps), spread over ~24h.</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
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

import { useState, useEffect, useRef } from 'react';
import { getTemplatesLive, syncTemplatesFromMeta, createTemplateLive, getSettings, getMediaHandle, deleteTemplateLive } from '../liveData';
import { IconSearch, IconPlus, IconDots, IconChevDown, IconX } from '../icons';
import { CLIENT } from '../config/client.js';

const CAT_STYLE = {
  Marketing: { bg: '#EAF1FB', fg: '#3F6FA8' },
  Utility: { bg: '#EAF6E4', fg: '#3B6B45' },
  Authentication: { bg: '#F3ECFB', fg: '#7A5BB9' },
};
function catChip(cat) {
  const c = CAT_STYLE[cat] || CAT_STYLE.Utility;
  return { background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999 };
}
function statusChip(status) {
  const ok = status === 'Approved';
  return { display: 'inline-flex', alignItems: 'center', gap: 6, background: ok ? '#EAF6E4' : '#FFF1DC', color: ok ? '#3B6B45' : '#B6743A', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999 };
}

const LANGUAGES = [
  { code: 'en', label: 'English' }, { code: 'en_US', label: 'English (US)' }, { code: 'en_GB', label: 'English (UK)' },
  { code: 'hi', label: 'Hindi' }, { code: 'mr', label: 'Marathi' }, { code: 'gu', label: 'Gujarati' },
  { code: 'ta', label: 'Tamil' }, { code: 'te', label: 'Telugu' }, { code: 'bn', label: 'Bengali' }, { code: 'pa', label: 'Punjabi' },
];

const CATEGORIES = [
  { key: 'MARKETING', mode: 'standard', label: 'Marketing', desc: 'Promotions, offers, announcements: anything that builds awareness or drives sales.' },
  { key: 'UTILITY', mode: 'standard', label: 'Utility', desc: 'Order updates, confirmations, reminders tied to a specific transaction or request.' },
  { key: 'MARKETING', mode: 'carousel', label: 'Carousel', desc: 'Up to 10 swipeable cards, each with an image, text and buttons. (Marketing)' },
  { key: 'AUTHENTICATION', mode: 'standard', label: 'Authentication', desc: 'One-time passcodes to verify a user. Fixed OTP format.' },
];

function varList(text) {
  const set = new Set();
  (text.match(/\{\{(\d+)\}\}/g) || []).forEach(m => set.add(parseInt(m.replace(/[^\d]/g, ''), 10)));
  return [...set].sort((a, b) => a - b);
}
function nextVarIndex(text) { const l = varList(text); return (l.length ? l[l.length - 1] : 0) + 1; }

const inputStyle = { width: '100%', border: '1px solid rgba(27,76,94,.18)', borderRadius: 9, padding: '10px 12px', fontSize: 13, color: 'var(--brand-primary)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: '#fff' };
const labelStyle = { fontSize: 12, fontWeight: 700, color: 'var(--brand-primary)', marginBottom: 6, display: 'block' };
const fmtBtn = { width: 32, height: 30, border: '1px solid rgba(27,76,94,.16)', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 13, color: 'var(--brand-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

// Small reusable media uploader → returns a Meta handle + preview url.
function MediaUpload({ accept, label, url, uploading, onPick }) {
  const ref = useRef(null);
  return (
    <div>
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
      {url ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {accept.includes('image') ? <img src={url} alt="" style={{ width: 54, height: 54, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(27,76,94,.12)' }} /> : <div style={{ width: 54, height: 54, borderRadius: 8, background: '#EAF1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📄</div>}
          <button onClick={() => ref.current?.click()} style={{ ...fmtBtn, width: 'auto', padding: '0 12px', fontWeight: 700 }}>Replace</button>
        </div>
      ) : (
        <button onClick={() => ref.current?.click()} disabled={uploading} style={{ border: '1px dashed rgba(27,76,94,.3)', background: '#fff', borderRadius: 9, padding: '12px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--brand-primary)', cursor: uploading ? 'default' : 'pointer', width: '100%' }}>
          {uploading ? 'Uploading sample…' : (label || 'Upload sample file')}
        </button>
      )}
    </div>
  );
}

function TemplateBuilder({ onClose, onCreated, initial }) {
  const [step, setStep] = useState(initial ? 'form' : 'category');
  const [category, setCategory] = useState(initial?.category || '');
  const [mode, setMode] = useState(initial?.mode || 'standard');     // 'standard' | 'carousel'
  const [name, setName] = useState(initial?.name || '');
  const [language, setLanguage] = useState(initial?.language || 'en');
  const [headerType, setHeaderType] = useState('NONE');
  const [headerText, setHeaderText] = useState('');
  const [headerHandle, setHeaderHandle] = useState('');
  const [headerUrl, setHeaderUrl] = useState('');
  const [headerUploading, setHeaderUploading] = useState(false);
  const [body, setBody] = useState(initial?.body || '');
  const [examples, setExamples] = useState({});
  const [footer, setFooter] = useState('');
  const [buttons, setButtons] = useState(initial?.buttons || []);
  const [ltoOn, setLtoOn] = useState(false);
  const [ltoText, setLtoText] = useState('');
  const [cards, setCards] = useState([{ body: '', imageHandle: '', imageUrl: '', uploading: false, buttons: [] }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef(null);

  const vars = varList(body);
  const nameValid = /^[a-z0-9_]+$/.test(name);
  const isCarousel = mode === 'carousel';
  const isAuth = category === 'AUTHENTICATION';

  function chooseCategory(c) { setCategory(c.key); setMode(c.mode); setStep('form'); }

  function wrap(marker) {
    const ta = bodyRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd, sel = body.slice(s, e) || 'text';
    const next = body.slice(0, s) + marker + sel + marker + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = s + marker.length; ta.selectionEnd = s + marker.length + sel.length; });
  }
  function insertVar() {
    const ta = bodyRef.current, n = nextVarIndex(body), token = `{{${n}}}`;
    const s = ta ? ta.selectionStart : body.length;
    setBody(body.slice(0, s) + token + body.slice(s));
    requestAnimationFrame(() => { if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = s + token.length; } });
  }

  async function uploadHeader(file) {
    setHeaderUploading(true); setError('');
    const res = await getMediaHandle(file);
    setHeaderUploading(false);
    if (res.ok) { setHeaderHandle(res.handle); setHeaderUrl(res.url); }
    else setError(res.error || 'Upload failed');
  }
  async function uploadCard(i, file) {
    setCards(cs => cs.map((c, idx) => idx === i ? { ...c, uploading: true } : c)); setError('');
    const res = await getMediaHandle(file);
    setCards(cs => cs.map((c, idx) => idx === i ? { ...c, uploading: false, imageHandle: res.ok ? res.handle : '', imageUrl: res.ok ? res.url : '' } : c));
    if (!res.ok) setError(res.error || 'Upload failed');
  }

  // buttons (standard)
  const addButton = () => buttons.length < 5 && setButtons([...buttons, { type: 'QUICK_REPLY', text: '', url: '', phone: '', code: '' }]);
  const updateButton = (i, p) => setButtons(buttons.map((b, idx) => idx === i ? { ...b, ...p } : b));
  const removeButton = i => setButtons(buttons.filter((_, idx) => idx !== i));

  // carousel cards
  const addCard = () => cards.length < 10 && setCards([...cards, { body: '', imageHandle: '', imageUrl: '', uploading: false, buttons: [] }]);
  const updateCard = (i, p) => setCards(cards.map((c, idx) => idx === i ? { ...c, ...p } : c));
  const removeCard = i => setCards(cards.filter((_, idx) => idx !== i));
  const addCardBtn = i => setCards(cards.map((c, idx) => idx === i && c.buttons.length < 2 ? { ...c, buttons: [...c.buttons, { type: 'QUICK_REPLY', text: '', url: '' }] } : c));
  const updateCardBtn = (i, j, p) => setCards(cards.map((c, idx) => idx === i ? { ...c, buttons: c.buttons.map((b, k) => k === j ? { ...b, ...p } : b) } : c));
  const removeCardBtn = (i, j) => setCards(cards.map((c, idx) => idx === i ? { ...c, buttons: c.buttons.filter((_, k) => k !== j) } : c));

  function mapButton(b) {
    if (b.type === 'URL') return { type: 'URL', text: b.text.trim(), url: b.url.trim() };
    if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text.trim(), phone_number: b.phone.trim() };
    if (b.type === 'COPY_CODE') return { type: 'COPY_CODE', example: (b.code || '').trim() };
    return { type: 'QUICK_REPLY', text: b.text.trim() };
  }

  function buildComponents() {
    const comps = [];
    if (!isCarousel) {
      if (headerType === 'TEXT' && headerText.trim()) comps.push({ type: 'HEADER', format: 'TEXT', text: headerText.trim() });
      else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && headerHandle) comps.push({ type: 'HEADER', format: headerType, example: { header_handle: [headerHandle] } });
      if (ltoOn) comps.push({ type: 'LIMITED_TIME_OFFER', limited_time_offer: { text: ltoText.trim() || 'Limited-time offer', has_expiration: true } });
    }
    const bodyComp = { type: 'BODY', text: body.trim() };
    if (vars.length) bodyComp.example = { body_text: [vars.map(i => (examples[i] || '').trim() || 'example')] };
    comps.push(bodyComp);
    if (!isCarousel && footer.trim()) comps.push({ type: 'FOOTER', text: footer.trim() });
    if (!isCarousel && buttons.length) comps.push({ type: 'BUTTONS', buttons: buttons.map(mapButton) });
    if (isCarousel) {
      comps.push({
        type: 'CAROUSEL',
        cards: cards.map(c => ({
          components: [
            { type: 'HEADER', format: 'IMAGE', example: { header_handle: [c.imageHandle] } },
            { type: 'BODY', text: c.body.trim() },
            ...(c.buttons.length ? [{ type: 'BUTTONS', buttons: c.buttons.map(mapButton) }] : []),
          ],
        })),
      });
    }
    return comps;
  }

  function validate() {
    if (!nameValid) return 'Template name must be lowercase letters, numbers and underscores only.';
    if (!body.trim()) return isCarousel ? 'The message bubble text (shown above the cards) is required.' : 'Body text is required.';
    for (const i of vars) if (!(examples[i] || '').trim()) return `Provide an example value for variable {{${i}}}.`;
    if (!isCarousel) {
      if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && !headerHandle) return 'Upload a sample file for the media header.';
      if (ltoOn && !ltoText.trim()) return 'Enter the offer text for the limited-time offer.';
      for (const b of buttons) {
        if (b.type === 'COPY_CODE') { if (!(b.code || '').trim()) return 'Copy-code buttons need an example code.'; continue; }
        if (!b.text.trim()) return 'Every button needs a label.';
        if (b.type === 'URL' && !b.url.trim()) return 'URL buttons need a link.';
        if (b.type === 'PHONE_NUMBER' && !b.phone.trim()) return 'Phone buttons need a number.';
      }
    } else {
      if (!cards.length) return 'Add at least one carousel card.';
      for (let i = 0; i < cards.length; i++) {
        if (!cards[i].imageHandle) return `Card ${i + 1}: upload an image.`;
        if (!cards[i].body.trim()) return `Card ${i + 1}: add the card text.`;
        for (const b of cards[i].buttons) {
          if (!b.text.trim()) return `Card ${i + 1}: every button needs a label.`;
          if (b.type === 'URL' && !b.url.trim()) return `Card ${i + 1}: URL button needs a link.`;
        }
      }
      // Meta requires all cards to share the same button structure
      const sig = c => c.buttons.map(b => b.type).join(',');
      if (new Set(cards.map(sig)).size > 1) return 'All carousel cards must have the same button layout (same button types in the same order).';
    }
    return '';
  }

  async function submit() {
    const v = validate(); if (v) { setError(v); return; }
    setSubmitting(true); setError('');
    const res = await createTemplateLive({ name, language, category, components: buildComponents() });
    setSubmitting(false);
    if (res.ok) onCreated(); else setError(res.error || 'Failed to create template.');
  }

  const previewBody = body.replace(/\{\{(\d+)\}\}/g, (_, n) => examples[n] || `[${n}]`) || 'Your message preview shows here…';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,58,53,.45)', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div className="fade-up" style={{ background: '#F7FAF7', margin: 'auto', width: 'min(1080px, 96vw)', height: 'min(92vh, 880px)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(14,58,53,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(27,76,94,.1)', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {step === 'form' && <button onClick={() => setStep('category')} style={{ border: 'none', background: '#F2F6F3', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, color: 'var(--brand-primary)', cursor: 'pointer' }}>← Back</button>}
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-primary)' }}>{step === 'category' ? 'Create a WhatsApp Template' : `New ${isCarousel ? 'Carousel' : CATEGORIES.find(c => c.key === category && c.mode === 'standard')?.label} Template`}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ border: '1px solid rgba(27,76,94,.16)', background: '#fff', borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)', cursor: 'pointer' }}>Cancel</button>
            {step === 'form' && <button onClick={submit} disabled={submitting} style={{ border: 'none', background: 'var(--brand-accent-soft)', borderRadius: 9, padding: '8px 18px', fontSize: 13, fontWeight: 800, color: 'var(--brand-primary-dark)', cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1 }}>{submitting ? 'Creating…' : 'Create Template'}</button>}
          </div>
        </div>

        {step === 'category' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 30px' }}>
            <div style={{ fontSize: 13, color: 'rgba(27,76,94,.6)', marginBottom: 20 }}>Choose the type of template you want to create.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 16 }}>
              {CATEGORIES.map(c => (
                <button key={c.label} onClick={() => chooseCategory(c)} style={{ textAlign: 'left', background: '#fff', border: '1px solid rgba(27,76,94,.14)', borderRadius: 14, padding: '20px 18px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand-accent-soft)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(27,76,94,.14)'}>
                  <span style={catChip(c.label === 'Carousel' ? 'Marketing' : c.label)}>{c.label}</span>
                  <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'rgba(27,76,94,.65)' }}>{c.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'form' && (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px' }}>
              {error && <div style={{ background: '#FDECEA', color: '#C7503B', fontSize: 12.5, fontWeight: 600, padding: '10px 12px', borderRadius: 9, marginBottom: 16 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Template name</label>
                  <input value={name} onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="welcome_new_lead" style={inputStyle} />
                  <div style={{ fontSize: 11, color: 'rgba(27,76,94,.5)', marginTop: 4 }}>Lowercase letters, numbers and underscores.</div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Language</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label} ({l.code})</option>)}
                  </select>
                </div>
              </div>

              {/* Standard header */}
              {!isCarousel && (
                <div style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>Header <span style={{ fontWeight: 500, color: 'rgba(27,76,94,.45)' }}>· optional</span></label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    {['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].map(h => (
                      <button key={h} onClick={() => setHeaderType(h)} style={{ border: headerType === h ? '1.5px solid var(--brand-accent-soft)' : '1px solid rgba(27,76,94,.16)', background: headerType === h ? '#F1FAF0' : '#fff', borderRadius: 9, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--brand-primary)', cursor: 'pointer', textTransform: 'capitalize' }}>{h === 'NONE' ? 'None' : h.toLowerCase()}</button>
                    ))}
                  </div>
                  {headerType === 'TEXT' && <input value={headerText} onChange={e => setHeaderText(e.target.value)} maxLength={60} placeholder="Header text (max 60 chars)" style={inputStyle} />}
                  {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && (
                    <MediaUpload accept={headerType === 'IMAGE' ? 'image/*' : headerType === 'VIDEO' ? 'video/*' : 'application/pdf'} label={`Upload a sample ${headerType.toLowerCase()}`} url={headerUrl} uploading={headerUploading} onPick={uploadHeader} />
                  )}
                </div>
              )}

              {/* Body */}
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>{isCarousel ? 'Message bubble (shown above the cards)' : 'Body'}</label>
                <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} maxLength={1024} rows={isCarousel ? 3 : 6} placeholder="Type your message…" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => wrap('*')} style={fmtBtn} title="Bold"><b>B</b></button>
                  <button onClick={() => wrap('_')} style={fmtBtn} title="Italic"><i>I</i></button>
                  <button onClick={() => wrap('~')} style={fmtBtn} title="Strikethrough"><s>S</s></button>
                  <button onClick={insertVar} style={{ ...fmtBtn, width: 'auto', padding: '0 12px', fontWeight: 700 }}>+ Add Variable</button>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(27,76,94,.45)' }}>{body.length}/1024</span>
                </div>
              </div>

              {vars.length > 0 && (
                <div style={{ marginBottom: 18, background: '#fff', border: '1px solid rgba(27,76,94,.12)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-primary)', marginBottom: 8 }}>Sample values</div>
                  {vars.map(i => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-primary)', minWidth: 42 }}>{`{{${i}}}`}</span>
                      <input value={examples[i] || ''} onChange={e => setExamples({ ...examples, [i]: e.target.value })} placeholder={`Example for {{${i}}}`} style={{ ...inputStyle, padding: '8px 10px' }} />
                    </div>
                  ))}
                </div>
              )}

              {/* Standard-only: LTO, footer, buttons */}
              {!isCarousel && (
                <>
                  {category === 'MARKETING' && (
                    <div style={{ marginBottom: 18, background: '#fff', border: '1px solid rgba(27,76,94,.12)', borderRadius: 10, padding: '12px 14px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)' }}>
                        <input type="checkbox" checked={ltoOn} onChange={e => setLtoOn(e.target.checked)} /> Limited-time offer
                      </label>
                      {ltoOn && <input value={ltoText} onChange={e => setLtoText(e.target.value)} maxLength={16} placeholder="Offer text (e.g. 20% OFF)" style={{ ...inputStyle, marginTop: 10 }} />}
                      {ltoOn && <div style={{ fontSize: 11, color: 'rgba(27,76,94,.5)', marginTop: 6 }}>Pair this with a Copy-code button below for the discount code. The countdown/expiry is set when the message is sent.</div>}
                    </div>
                  )}

                  <div style={{ marginBottom: 18 }}>
                    <label style={labelStyle}>Footer <span style={{ fontWeight: 500, color: 'rgba(27,76,94,.45)' }}>· optional</span></label>
                    <input value={footer} onChange={e => setFooter(e.target.value)} maxLength={60} placeholder="e.g. Reply STOP to opt out" style={inputStyle} />
                  </div>

                  <div>
                    <label style={labelStyle}>Buttons <span style={{ fontWeight: 500, color: 'rgba(27,76,94,.45)' }}>· optional</span></label>
                    {buttons.map((b, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                        <select value={b.type} onChange={e => updateButton(i, { type: e.target.value })} style={{ ...inputStyle, width: 140, cursor: 'pointer', padding: '8px 8px' }}>
                          <option value="QUICK_REPLY">Quick reply</option>
                          <option value="URL">Visit URL</option>
                          <option value="PHONE_NUMBER">Call phone</option>
                          <option value="COPY_CODE">Copy code</option>
                        </select>
                        {b.type === 'COPY_CODE' ? (
                          <input value={b.code} onChange={e => updateButton(i, { code: e.target.value })} placeholder="Example code e.g. SAVE20" style={{ ...inputStyle, padding: '8px 10px', flex: 1 }} />
                        ) : (
                          <input value={b.text} onChange={e => updateButton(i, { text: e.target.value })} maxLength={25} placeholder="Button label" style={{ ...inputStyle, padding: '8px 10px', flex: 1 }} />
                        )}
                        {b.type === 'URL' && <input value={b.url} onChange={e => updateButton(i, { url: e.target.value })} placeholder="https://…" style={{ ...inputStyle, padding: '8px 10px', flex: 1 }} />}
                        {b.type === 'PHONE_NUMBER' && <input value={b.phone} onChange={e => updateButton(i, { phone: e.target.value })} placeholder="+9198…" style={{ ...inputStyle, padding: '8px 10px', flex: 1 }} />}
                        <button onClick={() => removeButton(i)} style={{ border: 'none', background: '#F2F6F3', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'rgba(27,76,94,.55)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconX size={14} /></button>
                      </div>
                    ))}
                    {buttons.length < 5 && <button onClick={addButton} style={{ border: '1px dashed rgba(27,76,94,.3)', background: '#fff', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--brand-primary)', cursor: 'pointer' }}>+ Add Button</button>}
                  </div>
                </>
              )}

              {/* Carousel cards */}
              {isCarousel && (
                <div>
                  <label style={labelStyle}>Cards <span style={{ fontWeight: 500, color: 'rgba(27,76,94,.45)' }}>· {cards.length}/10 · all cards must use the same button layout</span></label>
                  {cards.map((card, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid rgba(27,76,94,.12)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--brand-primary)' }}>Card {i + 1}</span>
                        {cards.length > 1 && <button onClick={() => removeCard(i)} style={{ border: 'none', background: '#F2F6F3', borderRadius: 7, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, color: '#C7503B', cursor: 'pointer' }}>Remove</button>}
                      </div>
                      <div style={{ marginBottom: 10 }}><MediaUpload accept="image/*" label="Upload card image" url={card.imageUrl} uploading={card.uploading} onPick={f => uploadCard(i, f)} /></div>
                      <input value={card.body} onChange={e => updateCard(i, { body: e.target.value })} maxLength={160} placeholder="Card text" style={{ ...inputStyle, marginBottom: 10 }} />
                      {card.buttons.map((b, j) => (
                        <div key={j} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                          <select value={b.type} onChange={e => updateCardBtn(i, j, { type: e.target.value })} style={{ ...inputStyle, width: 130, cursor: 'pointer', padding: '8px 8px' }}>
                            <option value="QUICK_REPLY">Quick reply</option>
                            <option value="URL">Visit URL</option>
                          </select>
                          <input value={b.text} onChange={e => updateCardBtn(i, j, { text: e.target.value })} maxLength={25} placeholder="Label" style={{ ...inputStyle, padding: '8px 10px', flex: 1 }} />
                          {b.type === 'URL' && <input value={b.url} onChange={e => updateCardBtn(i, j, { url: e.target.value })} placeholder="https://…" style={{ ...inputStyle, padding: '8px 10px', flex: 1 }} />}
                          <button onClick={() => removeCardBtn(i, j)} style={{ border: 'none', background: '#F2F6F3', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'rgba(27,76,94,.55)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconX size={14} /></button>
                        </div>
                      ))}
                      {card.buttons.length < 2 && <button onClick={() => addCardBtn(i)} style={{ border: '1px dashed rgba(27,76,94,.3)', background: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: 'var(--brand-primary)', cursor: 'pointer' }}>+ Card button</button>}
                    </div>
                  ))}
                  {cards.length < 10 && <button onClick={addCard} style={{ border: '1px dashed rgba(27,76,94,.3)', background: '#fff', borderRadius: 9, padding: '10px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--brand-primary)', cursor: 'pointer', width: '100%' }}>+ Add Card</button>}
                </div>
              )}
            </div>

            {/* Preview */}
            <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid rgba(27,76,94,.1)', background: '#fff', padding: '22px 20px', overflowY: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'rgba(27,76,94,.45)', marginBottom: 12 }}>PREVIEW</div>
              <div style={{ background: '#DCEAD4', borderRadius: 14, padding: '16px 14px' }}>
                <div style={{ background: '#fff', borderRadius: '4px 12px 12px 12px', padding: '11px 13px', boxShadow: '0 1px 2px rgba(14,58,53,.12)' }}>
                  {headerType === 'TEXT' && headerText && <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 6 }}>{headerText}</div>}
                  {!isCarousel && headerUrl && headerType === 'IMAGE' && <img src={headerUrl} alt="" style={{ width: '100%', borderRadius: 8, marginBottom: 8, display: 'block' }} />}
                  {!isCarousel && ['VIDEO', 'DOCUMENT'].includes(headerType) && headerUrl && <div style={{ background: '#EAF1EA', borderRadius: 8, height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'rgba(27,76,94,.5)', marginBottom: 8, textTransform: 'capitalize' }}>{headerType.toLowerCase()}</div>}
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#1B3A36', whiteSpace: 'pre-wrap' }}>{previewBody}</div>
                  {!isCarousel && footer && <div style={{ fontSize: 11, color: 'rgba(27,76,94,.45)', marginTop: 7 }}>{footer}</div>}
                </div>
                {isCarousel && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, overflowX: 'auto', paddingBottom: 4 }}>
                    {cards.map((c, i) => (
                      <div key={i} style={{ flex: '0 0 130px', background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(14,58,53,.1)' }}>
                        {c.imageUrl ? <img src={c.imageUrl} alt="" style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }} /> : <div style={{ height: 80, background: '#EAF1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'rgba(27,76,94,.45)' }}>image</div>}
                        <div style={{ padding: '8px 9px', fontSize: 11, color: '#1B3A36', lineHeight: 1.4 }}>{c.body || 'Card text'}</div>
                        {c.buttons.map((b, j) => <div key={j} style={{ borderTop: '1px solid rgba(27,76,94,.08)', padding: '7px', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: '#1C8DD9' }}>{b.text || 'Button'}</div>)}
                      </div>
                    ))}
                  </div>
                )}
                {!isCarousel && buttons.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {buttons.map((b, i) => <div key={i} style={{ background: '#fff', borderRadius: 8, padding: '8px', textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: '#1C8DD9', boxShadow: '0 1px 2px rgba(14,58,53,.1)' }}>{b.type === 'COPY_CODE' ? `Copy ${b.code || 'code'}` : (b.text || 'Button')}</div>)}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(27,76,94,.5)', marginTop: 14, lineHeight: 1.5 }}>{isAuth ? 'Authentication templates use a fixed OTP format. Meta may adjust the wording on approval.' : 'After you create it, Meta reviews the template (minutes to a few hours). It shows as Pending here until approved.'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [builder, setBuilder] = useState(null);   // null = closed; {initial} = open
  const [number, setNumber] = useState('');
  const [menuFor, setMenuFor] = useState(null);

  function handleDuplicate(t) {
    setMenuFor(null);
    const catKey = String(t.category || 'UTILITY').toUpperCase();
    setBuilder({
      initial: {
        name: (t.name + '_v2').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60),
        category: ['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(catKey) ? catKey : 'UTILITY',
        mode: 'standard',
        language: t.language || 'en',
        body: t.body || '',
        buttons: (Array.isArray(t.buttons) ? t.buttons : []).filter(Boolean)
          .map(label => ({ type: 'QUICK_REPLY', text: String(label), url: '', phone: '', code: '' })),
      },
    });
  }

  async function handleDeleteTemplate(t) {
    setMenuFor(null);
    if (!window.confirm(`Delete the template “${t.name}”?\n\nThis removes it from Meta and here. This cannot be undone.`)) return;
    const res = await deleteTemplateLive(t.name);
    if (res.ok) { setSyncMsg(`Deleted “${t.name}”.`); await load(); }
    else setSyncMsg(res.error || 'Could not delete template.');
  }

  async function load() { setTemplates(await getTemplatesLive()); }
  useEffect(() => { load(); getSettings().then(s => setNumber(s?.business_number || '')); }, []);

  async function handleSync() {
    setSyncing(true); setSyncMsg('');
    const res = await syncTemplatesFromMeta();
    setSyncing(false);
    if (res.ok) { setSyncMsg(`Synced ${res.synced} template${res.synced === 1 ? '' : 's'} from Meta`); await load(); }
    else setSyncMsg(res.error || 'Sync failed');
  }
  async function handleCreated() { setBuilder(null); setSyncMsg('Template submitted to Meta. Pending review.'); await load(); }

  const filtered = templates.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()) || (t.body || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <header style={{ padding: '22px 30px 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: 'rgba(27,76,94,.45)' }}>CAMPAIGN</div>
          <h1 style={{ margin: '5px 0 0', fontSize: 23, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--brand-primary)' }}>WhatsApp Templates</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {number && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(27,76,94,.16)', borderRadius: 10, padding: '9px 12px', fontSize: 13, color: 'var(--brand-primary)', fontWeight: 600, background: '#fff' }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: '#3B6B45' }} />{number}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(27,76,94,.16)', borderRadius: 10, padding: '9px 12px', fontSize: 13, color: 'rgba(27,76,94,.45)', background: '#fff' }}>
            <span style={{ width: 14, height: 14, display: 'flex' }}><IconSearch size={14} /></span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--brand-primary)', width: 150, fontFamily: 'inherit' }} />
          </div>
          <button onClick={handleSync} disabled={syncing} style={{ background: '#fff', border: '1px solid rgba(27,76,94,.16)', color: 'var(--brand-primary)', fontSize: 13, fontWeight: 700, padding: '9px 15px', borderRadius: 10, cursor: syncing ? 'default' : 'pointer', opacity: syncing ? 0.6 : 1 }}>{syncing ? 'Syncing…' : 'Sync with Meta'}</button>
          <button onClick={() => setBuilder({ initial: null })} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--brand-accent-soft)', border: 'none', color: 'var(--brand-primary-dark)', fontSize: 13, fontWeight: 800, padding: '10px 16px', borderRadius: 10, cursor: 'pointer' }}>
            <IconPlus size={15} /> Add Template
          </button>
        </div>
      </header>

      {syncMsg && <div style={{ margin: '0 30px 8px', fontSize: 12.5, fontWeight: 600, color: (syncMsg.includes('Synced') || syncMsg.includes('submitted')) ? '#3B6B45' : '#C7503B' }}>{syncMsg}</div>}
      {!syncMsg && templates.length === 0 && <div style={{ margin: '0 30px 8px', fontSize: 12.5, color: 'rgba(27,76,94,.55)' }}>No templates yet. Click “Add Template” to create one.</div>}

      <div style={{ padding: '6px 30px 36px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(266px,1fr))', gap: 18 }}>
          {filtered.map(t => (
            <div key={t.id} style={{ background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 16, boxShadow: '0 1px 3px rgba(14,58,53,.05)', position: 'relative' }}>
              <div style={{ background: '#DCEAD4', padding: '16px 14px 18px', minHeight: 150, borderRadius: '16px 16px 0 0' }}>
                <div style={{ background: '#fff', borderRadius: '4px 12px 12px 12px', padding: '10px 12px 9px', boxShadow: '0 1px 2px rgba(14,58,53,.12)', maxWidth: '96%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--brand-primary)', color: 'var(--brand-accent-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>d.</div>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--brand-primary)' }}>{CLIENT.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'rgba(27,76,94,.4)' }}>11:24</span>
                  </div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.5, color: '#1B3A36' }}>{t.body}</div>
                </div>
              </div>
              <div style={{ padding: '14px 15px 15px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--brand-primary)', wordBreak: 'break-all', lineHeight: 1.3 }}>{t.name}</span>
                  <span style={{ position: 'relative', flexShrink: 0 }}>
                    <button onClick={() => setMenuFor(menuFor === t.id ? null : t.id)} style={{ width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.5)', cursor: 'pointer', border: 'none', background: menuFor === t.id ? '#F2F6F3' : 'transparent' }}><IconDots size={15} /></button>
                    {menuFor === t.id && (
                      <>
                        <div onClick={() => setMenuFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                        <div style={{ position: 'absolute', top: '110%', right: 0, background: '#fff', border: '1px solid rgba(27,76,94,.14)', borderRadius: 10, boxShadow: '0 8px 24px rgba(14,58,53,.16)', zIndex: 50, minWidth: 150, overflow: 'hidden' }}>
                          <button onClick={() => handleDuplicate(t)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: '#fff', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--brand-primary)', borderBottom: '1px solid rgba(27,76,94,.07)' }}>Duplicate</button>
                          <button onClick={() => handleDeleteTemplate(t)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: '#fff', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#C7503B' }}>Delete</button>
                        </div>
                      </>
                    )}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
                  <span style={catChip(t.category)}>{t.category}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(27,76,94,.55)', border: '1px solid rgba(27,76,94,.16)', padding: '3px 9px', borderRadius: 999 }}>{t.language}</span>
                  <span style={statusChip(t.status)}><span style={{ width: 6, height: 6, borderRadius: '50%', background: t.status === 'Approved' ? '#3B6B45' : '#D9A93B' }} />{t.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {builder && <TemplateBuilder key={builder.initial?.name || 'new'} initial={builder.initial} onClose={() => setBuilder(null)} onCreated={handleCreated} />}
    </div>
  );
}

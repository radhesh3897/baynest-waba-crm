import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getConversationsLive, getMessagesLive, sendMessageLive, sendInstagramMessageLive, sendMediaLive, subscribeMessages,
  getTemplatesLive, markConversationRead, markConversationStatus, getFlowRepliedContactIds, uploadHeaderImage,
  relativeTime,
} from '../liveData';
import {
  IconSearch, IconRefresh, IconSmile, IconClip, IconSend, IconClock,
  IconTemplate, IconChevDown, IconCalendar, IconInbox, IconFlow, TickIcon, IconX,
} from '../icons';
import { useIsMobile } from '../useIsMobile';
import ContactNotes from '../components/ContactNotes';
import LeadProperties from '../components/LeadProperties';
import LeadCustomFields from '../components/LeadCustomFields';
import TemperatureTag from '../components/TemperatureTag';
import PipelineMover from '../components/PipelineMover';
import { formatCr, pipelineOf, leadChip } from '../pipeline';
import LeadAnswersEditable from '../components/LeadAnswersEditable';

function IconPanelClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" />
    </svg>
  );
}
function IconBack({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function IconInfo({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}
function IconFilter({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16M7 12h10M10 19h4" />
    </svg>
  );
}

function fmtTimer(secs) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const p = n => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}
// How many body variables ({{1}}, {{2}}…) a template uses — Meta needs one
// parameter per variable or it rejects the send with error #132000.
// Human-readable reason for a failed message (from Meta's error payload).
const ERR_HINTS = {
  131049: 'Meta limited delivery to protect engagement. This recipient has received too many marketing messages recently. Campaigns auto-retry this over 24h.',
  131026: 'Undeliverable. The number may not be on WhatsApp, or can’t receive messages.',
  132012: 'Template parameter/format mismatch (e.g. a required image header wasn’t sent).',
  132000: 'Wrong number of template variables.',
  131047: 'Outside the 24-hour window. A template is required to re-open the chat.',
  470: 'Outside the 24-hour window. A template is required.',
};
function friendlyError(err) {
  if (!err) return 'Message not sent.';
  const e = Array.isArray(err) ? err[0] : err;
  const base = e?.title || e?.message || 'Message not sent';
  const code = e?.code ? ` (#${e.code})` : '';
  const hint = e?.code && ERR_HINTS[e.code] ? `\n\n${ERR_HINTS[e.code]}` : '';
  return `${base}${code}${hint}`;
}

function templateVarCount(body) {
  const nums = new Set();
  (body || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => { nums.add(Number(n)); return _; });
  return nums.size ? Math.max(...nums) : 0;
}

// What to show for a message that carries no text of its own. WhatsApp voice
// notes and media arrive with an empty body, so without a label the bubble would
// render blank and the message would look like it never arrived.
const MEDIA_LABEL = {
  audio: '🎤 Voice message',
  image: '📷 Photo',
  video: '🎬 Video',
  document: '📄 Document',
  sticker: '🙂 Sticker',
  location: '📍 Location',
  contacts: '👤 Contact card',
  reaction: '❤️ Reaction',
};

// Reconstruct the ACTUAL text sent for a template message, so the timeline shows
// the real message (not just a "TEMPLATE" chip). Uses the template definition's
// body (with {{1}} placeholders) + the filled-in values stored on the message
// payload. Also prepends a TEXT header if the template had one.
function renderSentTemplate(m, templatesByName) {
  const tpl = templatesByName?.[m.template_name];
  // Values the message was sent with, pulled from the stored Cloud API payload.
  const comps = m?.payload?.template?.components || [];
  const bodyParams = (comps.find(c => c?.type === 'body')?.parameters || []).map(p => p?.text ?? '');
  let text = tpl?.body || m.body || '';
  // Substitute {{1}}, {{2}}… with the sent values.
  text = text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => {
    const v = bodyParams[Number(n) - 1];
    return (v === undefined || v === '') ? _ : v;
  });
  const headerText = tpl?.header_type === 'TEXT' && tpl?.header_text ? tpl.header_text : '';
  const full = [headerText, text].filter(Boolean).join('\n\n').trim();
  return full || null;
}

function FilterBtn({ label, icon: Icon, active, onClick }) {
  return (
    <motion.button onClick={onClick} whileHover={{ x: 2 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 9px', marginBottom: 1, border: 'none', cursor: 'pointer', borderRadius: 8, fontSize: 13, fontWeight: active ? 700 : 500, background: active ? '#EAF6E4' : 'transparent', color: active ? 'var(--brand-primary)' : 'rgba(27,76,94,.7)' }}>
      <span style={{ width: 15, height: 15, display: 'flex', flexShrink: 0, color: active ? '#3B6B45' : 'rgba(27,76,94,.5)' }}><Icon size={15} /></span>
      <span>{label}</span>
    </motion.button>
  );
}

const INBOX_FILTERS = [
  { key: 'all', label: 'All', Icon: IconInbox },
  { key: 'flows', label: 'Flows', Icon: IconFlow },
];

const EMOJIS = ['😀', '😁', '😂', '🤣', '🙂', '😊', '😍', '😎', '🤝', '👍', '👎', '🙏', '👏', '💪', '🔥', '✅', '❌', '🎉', '🎯', '🚀', '💡', '📈', '💰', '🙌', '💬', '📞', '📅', '⏰', '📍', '✉️', '❤️', '⭐', '✨', '🤔', '👋', '😅', '🥳', '🆗', '➡️', '🙋'];

// One component, two inboxes. `channel` scopes it to WhatsApp or Instagram;
// the differences between them (templates, media, what happens when the 24h
// window closes) are handled inline rather than by forking the screen.
export default function Inbox({ channel = 'whatsapp', openContactId = null, onOpenedContact }) {
  const isIg = channel === 'instagram';
  const isMobile = useIsMobile();
  const [convos, setConvos] = useState([]);
  const [selConvId, setSelConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inboxFilter, setInboxFilter] = useState('all');
  const [convStatus, setConvStatus] = useState('open'); // 'open' | 'closed' (always one)
  const [readStatus, setReadStatus] = useState('');     // '' = All, 'seen', 'unseen'
  const [durFrom, setDurFrom] = useState('');
  const [durTo, setDurTo] = useState('');
  const [groups, setGroups] = useState({ status: true, read: true, duration: true });
  const [tab, setTab] = useState('interactions');
  const [contactPanelOpen, setContactPanelOpen] = useState(true);
  const [windowSecs, setWindowSecs] = useState(0);
  const [composerText, setComposerText] = useState('');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendError, setSendError] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [pickerTemplates, setPickerTemplates] = useState([]);
  const templatesByName = useMemo(() => Object.fromEntries((pickerTemplates || []).map(t => [t.name, t])), [pickerTemplates]);
  const [flowIds, setFlowIds] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [mobilePane, setMobilePane] = useState('list');   // 'list' | 'thread'
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [tplToFill, setTplToFill] = useState(null);       // template awaiting variable values
  const [tplVars, setTplVars] = useState([]);             // string per {{n}}
  const [tplImage, setTplImage] = useState('');           // uploaded image URL for IMAGE-header templates
  const [tplImgUploading, setTplImgUploading] = useState(false);
  const [sendingTpl, setSendingTpl] = useState(false);    // template send in flight
  const tplImgInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const selConvIdRef = useRef(null);
  const fileInputRef = useRef(null);
  const composerRef = useRef(null);

  async function handleSendFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !contact?.wa_id) return;
    if (file.size > 16 * 1024 * 1024) { setSendError('File too large. WhatsApp allows up to 16MB.'); return; }
    setSendError(''); setUploading(true); setShowEmoji(false);
    const res = await sendMediaLive(contact.wa_id, file, composerText.trim());
    setUploading(false);
    if (res.ok) { setComposerText(''); await getMessagesLive(selConvId).then(setMessages); }
    else setSendError(res.error || 'Failed to send attachment');
  }

  async function reloadConvos() {
    const data = await getConversationsLive(channel);
    setConvos(data);
    setLoading(false);
    // On mobile we keep the list visible until the user taps a conversation;
    // on desktop we auto-open the first one so the thread pane isn't empty.
    setSelConvId(prev => (prev || (!isMobile && data.length ? data[0].id : null)));
  }

  useEffect(() => {
    reloadConvos();
    getTemplatesLive().then(t => setPickerTemplates(t || []));
    getFlowRepliedContactIds().then(setFlowIds);
  }, []);

  // Someone asked for one lead's chat (the "Open chat" button on a lead).
  // Select that thread once the list has loaded, and on a phone jump straight
  // past the conversation list into the thread itself.
  useEffect(() => {
    if (!openContactId || !convos.length) return;
    const match = convos.find(c => c.contact_id === openContactId || c.contact?.id === openContactId);
    if (match) {
      setSelConvId(match.id);
      if (isMobile) { setMobilePane('thread'); setContactPanelOpen(false); }
    }
    // Clear the request either way — a lead with no thread yet should not keep
    // re-firing this on every poll.
    onOpenedContact?.(!!match);
    // eslint-disable-next-line
  }, [openContactId, convos.length]);

  useEffect(() => {
    const unsub = subscribeMessages(payload => {
      reloadConvos();
      const convId = payload?.new?.conversation_id || payload?.old?.conversation_id;
      if (convId && convId === selConvIdRef.current) getMessagesLive(convId).then(setMessages);
    });
    return unsub;
  }, []);

  useEffect(() => { selConvIdRef.current = selConvId; }, [selConvId]);

  // Load thread + window timer + mark read when a conversation is opened.
  useEffect(() => {
    if (!selConvId) return;
    getMessagesLive(selConvId).then(setMessages);
    const conv = convos.find(c => c.id === selConvId);
    if (conv) {
      const remaining = Math.max(0, Math.floor((new Date(conv.windowExpiresAt) - Date.now()) / 1000));
      setWindowSecs(remaining);
      if (conv.unread_count > 0) {
        markConversationRead(selConvId);
        setConvos(prev => prev.map(c => c.id === selConvId ? { ...c, unread_count: 0 } : c));
      }
    }
    setSendError('');
  }, [selConvId, convos]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  // Auto-grow the composer as the user types (and shrink back after sending).
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [composerText]);
  useEffect(() => { const t = setInterval(() => setWindowSecs(s => Math.max(0, s - 1)), 1000); return () => clearInterval(t); }, []);

  const selConv = convos.find(c => c.id === selConvId);
  const contact = selConv?.contact;
  const windowOpen = windowSecs > 0;

  // Stage, tag and deal value can all change from inside the thread. Patch the
  // conversation's contact in place so the list row and the header agree with
  // the panel without a refetch.
  function patchContact(id, patch) {
    setConvos(prev => prev.map(c =>
      c.contact?.id === id ? { ...c, contact: { ...c.contact, ...patch } } : c));
  }

  function selectConv(id) {
    setSelConvId(id);
    if (isMobile) { setMobilePane('thread'); setContactPanelOpen(false); }
  }

  const visibleConvos = convos.filter(c => {
    if (inboxFilter === 'flows' && !flowIds.includes(c.contact_id)) return false;
    if (convStatus === 'open' && c.status === 'closed') return false;
    if (convStatus === 'closed' && c.status !== 'closed') return false;
    if (readStatus === 'unseen' && !(c.unread_count > 0)) return false;
    if (readStatus === 'seen' && c.unread_count > 0) return false;
    if (durFrom && c.last_message_at && c.last_message_at < durFrom) return false;
    if (durTo && c.last_message_at && c.last_message_at > durTo + 'T23:59:59') return false;
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      if (!(c.contact?.profile_name || '').toLowerCase().includes(q) && !(c.preview || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  async function handleSend() {
    if (!selConvId || !composerText.trim()) return;
    if (isIg ? !contact?.ig_id : !contact?.wa_id) return;
    setSendError('');
    const text = composerText.trim();
    setComposerText('');
    setShowEmoji(false);
    // Optimistic: drop the bubble into the chat instantly (with a pop), then
    // reconcile with the real row once Meta confirms — no more 2-3s blank wait.
    const tempId = 'temp_' + Date.now();
    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    setMessages(prev => [...prev, { id: tempId, direction: 'out', type: 'text', body: text, timeStr, status: 'sending' }]);
    // Outside the 24h window Instagram still allows a HUMAN-typed reply for up
    // to 7 days under the human-agent tag. This composer is only ever driven by
    // a person, so the tag is honest here.
    const result = isIg
      ? await sendInstagramMessageLive(contact.id, text, { humanAgent: !selConv?.windowOpen })
      : await sendMessageLive(contact.wa_id, { type: 'text', body: text });
    if (result.ok) {
      getMessagesLive(selConvId).then(setMessages);
    } else {
      setSendError(result.error || 'Failed to send');
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    }
  }

  function closeTemplatePicker() {
    if (sendingTpl) return; // don't dismiss mid-send
    setShowTemplatePicker(false);
    setTplToFill(null);
    setTplVars([]);
  }

  // Clicking a template:
  //  - 0 variables → send immediately
  //  - 1 variable  → it's the name; auto-fill the contact's FIRST name and send (no prompt)
  //  - 2+ variables → open the fill step, prefilling {{1}} with the first name
  async function handleTplImageUpload(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setSendError(''); setTplImgUploading(true);
    const res = await uploadHeaderImage(f);
    setTplImgUploading(false);
    if (res.ok) setTplImage(res.url); else setSendError(res.error || 'Image upload failed');
  }

  function onPickTemplate(tpl) {
    const n = templateVarCount(tpl.body);
    const needsImage = (tpl.header_type || '').toUpperCase() === 'IMAGE';
    const firstName = contact?.firstName || (contact?.profile_name || '').trim().split(/\s+/)[0] || '';
    // No image + no vars → send now; no image + one var → auto first name.
    if (!needsImage && n === 0) { handleSendTemplate(tpl, [], ''); return; }
    if (!needsImage && n === 1) { handleSendTemplate(tpl, [firstName || contact?.profile_name || 'there'], ''); return; }
    // Otherwise open the fill step (collect image URL and/or variables).
    setTplToFill(tpl);
    setTplImage('');
    setTplVars(Array.from({ length: n }, (_, i) => (i === 0 ? firstName : '')));
  }

  async function handleSendTemplate(tpl, varValues = [], imageUrl = '') {
    if (!selConvId || !contact?.wa_id || sendingTpl) return;
    setSendError('');
    const components = [];
    if ((tpl.header_type || '').toUpperCase() === 'IMAGE' && imageUrl.trim()) {
      components.push({ type: 'header', parameters: [{ type: 'image', image: { link: imageUrl.trim() } }] });
    }
    if (varValues.length) {
      components.push({ type: 'body', parameters: varValues.map(v => ({ type: 'text', text: (v || '').trim() || ' ' })) });
    }
    setSendingTpl(true);
    const result = await sendMessageLive(contact.wa_id, { type: 'template', template_name: tpl.name, body: tpl.body, language: tpl.language, components });
    setSendingTpl(false);
    if (result.ok) {
      setShowTemplatePicker(false);
      setTplToFill(null);
      setTplVars([]);
      await getMessagesLive(selConvId).then(setMessages);
    } else {
      setSendError(result.error || 'Failed to send');
    }
  }

  async function toggleConvStatus() {
    if (!selConv) return;
    const next = selConv.status === 'closed' ? 'open' : 'closed';
    await markConversationStatus(selConv.id, next);
    setConvos(prev => prev.map(c => c.id === selConv.id ? { ...c, status: next } : c));
  }

  const toggleGroup = k => setGroups(g => ({ ...g, [k]: !g[k] }));
  const groupSectionBtn = (label, key) => (
    <button onClick={() => toggleGroup(key)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 4, fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'rgba(27,76,94,.45)' }}>
      <span>{label}</span>
      <span style={{ width: 13, height: 13, display: 'flex', transition: 'transform .2s', transform: groups[key] ? 'none' : 'rotate(-90deg)' }}><IconChevDown size={13} /></span>
    </button>
  );
  const pill = (label, active, onClick) => (
    <button onClick={onClick} style={{ padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: active ? '1.5px solid var(--brand-accent-soft)' : '1.5px solid rgba(27,76,94,.16)', background: active ? '#EAF6E4' : '#fff', color: active ? 'var(--brand-primary)' : 'rgba(27,76,94,.6)' }}>{label}</button>
  );

  // ── Reusable filter controls (left pane on desktop, sheet on mobile) ──
  const filtersInner = (
    <>
      {INBOX_FILTERS.map(f => (
        <FilterBtn key={f.key} label={f.label} icon={f.Icon} active={inboxFilter === f.key} onClick={() => setInboxFilter(f.key)} />
      ))}
      {inboxFilter === 'flows' && (
        <div style={{ fontSize: 11, color: 'rgba(27,76,94,.45)', padding: '4px 9px 0', lineHeight: 1.5 }}>People who were sent a flow and replied.</div>
      )}

      <div style={{ marginTop: 18 }}>
        {groupSectionBtn('CONVERSATION STATUS', 'status')}
        {groups.status && (
          <div style={{ marginTop: 8, display: 'flex', gap: 7, padding: '0 4px' }}>
            {pill('Open', convStatus === 'open', () => setConvStatus('open'))}
            {pill('Closed', convStatus === 'closed', () => setConvStatus('closed'))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        {groupSectionBtn('READ STATUS', 'read')}
        {groups.read && (
          <div style={{ marginTop: 8, display: 'flex', gap: 7, padding: '0 4px' }}>
            {pill('All', readStatus === '', () => setReadStatus(''))}
            {pill('Seen', readStatus === 'seen', () => setReadStatus('seen'))}
            {pill('Unseen', readStatus === 'unseen', () => setReadStatus('unseen'))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        {groupSectionBtn('DURATION', 'duration')}
        {groups.duration && (
          <div style={{ marginTop: 8, padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(27,76,94,.5)' }}>From
              <input type="date" value={durFrom} onChange={e => setDurFrom(e.target.value)} style={{ width: '100%', marginTop: 3, boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.16)', borderRadius: 8, padding: '7px 9px', fontSize: 12, color: 'var(--brand-primary)', fontFamily: 'inherit', outline: 'none' }} />
            </label>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(27,76,94,.5)' }}>To
              <input type="date" value={durTo} onChange={e => setDurTo(e.target.value)} style={{ width: '100%', marginTop: 3, boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.16)', borderRadius: 8, padding: '7px 9px', fontSize: 12, color: 'var(--brand-primary)', fontFamily: 'inherit', outline: 'none' }} />
            </label>
            {(durFrom || durTo) && <button onClick={() => { setDurFrom(''); setDurTo(''); }} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#3B6B45', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: '2px 0' }}>Clear dates</button>}
          </div>
        )}
      </div>
    </>
  );

  // ── Reusable conversation row ──
  const renderConvoRow = (conv) => {
    const active = conv.id === selConvId && !isMobile;
    return (
      <motion.div key={conv.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
        whileHover={{ backgroundColor: active ? '#F2F8F2' : 'rgba(27,76,94,.05)' }}
        onClick={() => selectConv(conv.id)}
        style={{ display: 'flex', gap: 11, padding: isMobile ? '13px 16px' : '12px 14px', cursor: 'pointer', borderLeft: active ? '3px solid var(--brand-accent-soft)' : '3px solid transparent', background: active ? '#F2F8F2' : 'transparent', borderBottom: '1px solid rgba(27,76,94,.06)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: isMobile ? 15 : 13.5, fontWeight: conv.unread_count > 0 ? 800 : 600, color: 'var(--brand-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 auto', minWidth: 0 }}>{conv.contact?.profile_name}</span>
            <span style={{ fontSize: isMobile ? 11 : 10.5, color: 'rgba(27,76,94,.45)', whiteSpace: 'nowrap', flexShrink: 0 }}>{conv.relativeTime}</span>
          </div>
          <div style={{ fontSize: isMobile ? 13 : 12, color: 'rgba(27,76,94,.6)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.preview}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: conv.status === 'closed' ? 'rgba(27,76,94,.08)' : '#EAF6E4', color: conv.status === 'closed' ? 'rgba(27,76,94,.55)' : '#3B6B45' }}>{conv.status === 'closed' ? 'Closed' : 'Open'}</span>
            {/* Which lead is worth answering first, without opening the thread. */}
            <TemperatureTag temp={conv.contact?.temperature} override={conv.contact?.temperature_override} />
            {conv.unread_count > 0 && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-accent-soft)' }} />}
          </div>
        </div>
      </motion.div>
    );
  };

  const convoListBody = (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
      {loading && <div style={{ padding: '24px 16px', fontSize: 13, color: 'rgba(27,76,94,.5)' }}>Loading conversations…</div>}
      {!loading && convos.length === 0 && (
        <div style={{ padding: '24px 16px', fontSize: 13, color: 'rgba(27,76,94,.5)', lineHeight: 1.6 }}>No conversations yet. They appear here when someone messages your WhatsApp number.</div>
      )}
      {!loading && convos.length > 0 && visibleConvos.length === 0 && (
        <div style={{ padding: '24px 16px', fontSize: 13, color: 'rgba(27,76,94,.5)' }}>No conversations match these filters.</div>
      )}
      <AnimatePresence initial={false}>
        {visibleConvos.map(renderConvoRow)}
      </AnimatePresence>
    </div>
  );

  // ── Reusable composer / locked-window footer ──
  // WhatsApp hard-locks once the 24h window closes: only an approved template
  // re-opens it. Instagram has no templates, but Meta's human-agent tag lets a
  // PERSON reply for up to 7 days, and this composer is only ever driven by a
  // person, so Instagram keeps typing enabled with a warning instead.
  const composer = (windowOpen || isIg) ? (
    <div style={{ background: '#fff', borderTop: '1px solid rgba(27,76,94,.10)', padding: isMobile ? '10px 12px 12px' : '12px 20px 14px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        {isIg ? <span /> : (
          <button onClick={() => { setSendError(''); setShowTemplatePicker(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#3B6B45' }}>
            <span style={{ width: 14, height: 14, display: 'flex' }}><IconTemplate size={14} /></span>Templates
          </button>
        )}
        {windowOpen ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#EAF6E4', color: '#3B6B45', fontSize: 12, fontWeight: 800, padding: '4px 11px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ width: 13, height: 13, display: 'flex' }}><IconClock size={13} /></span>{fmtTimer(windowSecs)} window left
          </div>
        ) : (
          <div title="Meta allows a human-typed reply for up to 7 days after their last message" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FFF1DC', color: '#8A6420', fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 999 }}>
            <span style={{ width: 13, height: 13, display: 'flex' }}><IconClock size={13} /></span>Window closed, replying as a human agent
          </div>
        )}
      </div>

      <AnimatePresence>
        {showEmoji && (
          <motion.div initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }} transition={{ duration: 0.15 }}
            style={{ position: 'absolute', bottom: 64, left: 12, right: isMobile ? 12 : 'auto', background: '#fff', border: '1px solid rgba(27,76,94,.12)', borderRadius: 14, boxShadow: '0 12px 32px rgba(14,58,53,.18)', padding: 12, width: isMobile ? 'auto' : 308, boxSizing: 'border-box', zIndex: 30 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: 'rgba(27,76,94,.4)' }}>EMOJI</span>
              <button onClick={() => setShowEmoji(false)} style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: '#F2F6F3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.5)' }}><IconX size={12} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 2 }}>
              {EMOJIS.map(e => (
                <button key={e} onClick={() => setComposerText(t => t + e)}
                  onMouseEnter={ev => ev.currentTarget.style.background = '#F2F8F2'} onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 19, padding: '5px 0', borderRadius: 8, lineHeight: 1 }}>{e}</button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, border: '1px solid rgba(27,76,94,.16)', borderRadius: 14, padding: '9px 12px', background: '#fff' }}>
        <button onClick={() => setShowEmoji(v => !v)} title="Emoji" style={{ width: 22, height: 22, color: showEmoji ? '#3B6B45' : 'rgba(27,76,94,.5)', display: 'flex', flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}><IconSmile size={20} /></button>
        {/* Attachments go through send-media, which is WhatsApp-only. Hidden on
            Instagram rather than left there to fail. */}
        {!isIg && <>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach image, video or PDF" style={{ width: 22, height: 22, color: uploading ? 'rgba(27,76,94,.3)' : 'rgba(27,76,94,.5)', display: 'flex', flexShrink: 0, border: 'none', background: 'none', cursor: uploading ? 'default' : 'pointer', padding: 0 }}><IconClip size={20} /></button>
          <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" onChange={handleSendFile} style={{ display: 'none' }} />
        </>}
        <textarea ref={composerRef} value={composerText} onChange={e => setComposerText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isMobile) { e.preventDefault(); handleSend(); } }} placeholder="Type a message…" rows={1}
          style={{ flex: 1, fontSize: isMobile ? 16 : 13.5, color: 'var(--brand-primary)', border: 'none', outline: 'none', resize: 'none', background: 'transparent', fontFamily: 'inherit', lineHeight: 1.5, padding: '2px 0', maxHeight: 120, overflowY: 'auto' }} />
        <motion.button whileTap={{ scale: 0.9 }} onClick={handleSend} style={{ width: 38, height: 38, borderRadius: 10, border: 'none', background: 'var(--brand-accent-soft)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ width: 18, height: 18, color: 'var(--brand-primary-dark)', display: 'flex' }}><IconSend size={18} /></span>
        </motion.button>
      </div>
    </div>
  ) : (
    <div style={{ background: '#fff', borderTop: '1px solid rgba(27,76,94,.10)', padding: isMobile ? '10px 12px 12px' : '12px 20px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#FFF1DC', border: '1px solid #F0D9B5', borderRadius: 10, padding: '9px 13px', marginBottom: 10 }}>
        <span style={{ width: 16, height: 16, color: '#B6743A', display: 'flex', flexShrink: 0 }}><IconClock size={16} /></span>
        <span style={{ fontSize: 12.5, color: '#8A6420', fontWeight: 600 }}>24-hour window closed. Send a template to re-open the conversation.</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {!isMobile && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, border: '1px solid rgba(27,76,94,.12)', borderRadius: 14, padding: '11px 13px', background: '#F3F5F4', opacity: .6 }}>
            <span style={{ width: 20, height: 20, color: 'rgba(27,76,94,.35)', display: 'flex' }}><IconSmile size={20} /></span>
            <span style={{ flex: 1, fontSize: 13.5, color: 'rgba(27,76,94,.4)' }}>Free-text disabled outside the window</span>
          </div>
        )}
        <button onClick={() => { setSendError(''); setShowTemplatePicker(true); }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--brand-primary)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 800, padding: '13px 20px', borderRadius: 12, cursor: 'pointer', flex: isMobile ? 1 : 'none', flexShrink: 0 }}>
          <span style={{ width: 16, height: 16, display: 'flex' }}><IconTemplate size={16} /></span>Send Template
        </button>
      </div>
    </div>
  );

  // ── Reusable thread (messages + tabs + composer), header built per-layout ──
  const threadBody = (
    <>
      <div style={{ background: '#fff', borderBottom: '1px solid rgba(27,76,94,.10)', padding: '0 20px', display: 'flex' }}>
        {['interactions', 'notes'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '12px 4px', marginRight: 22, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13.5, fontWeight: tab === t ? 700 : 500, color: tab === t ? 'var(--brand-primary)' : 'rgba(27,76,94,.5)', borderBottom: tab === t ? '2px solid var(--brand-primary)' : '2px solid transparent' }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'interactions' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 14px' : '22px 28px', minHeight: 0 }}>
            {messages.map(m => {
              const out = m.direction === 'out';
              return (
                <motion.div key={m.id}
                  initial={{ opacity: 0, y: out ? 6 : 8, scale: out ? 0.82 : 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={out ? { type: 'spring', stiffness: 520, damping: 26 } : { duration: 0.18 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: out ? 'flex-end' : 'flex-start', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: 'rgba(27,76,94,.5)', fontWeight: 600, margin: out ? '0 4px 4px 0' : '0 0 4px 4px' }}>
                    {out ? 'You' : contact?.profile_name} · {m.timeStr}
                  </div>
                  <div style={{ maxWidth: isMobile ? '85%' : '74%', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: out ? 'var(--brand-primary)' : '#fff', color: out ? '#EAF6E4' : '#1B3A36', border: out ? 'none' : '1px solid rgba(27,76,94,.10)', borderBottomRightRadius: out ? 4 : 14, borderBottomLeftRadius: out ? 14 : 4, boxShadow: '0 1px 2px rgba(14,58,53,.04)', padding: '10px 13px' }}>
                    {m.type === 'template' && <div style={{ display: 'inline-block', fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', color: out ? 'var(--brand-accent-pale)' : '#3B6B45', background: out ? 'rgba(255,255,255,.18)' : 'rgba(115,167,111,.14)', padding: '2px 7px', borderRadius: 5, marginBottom: 6 }}>TEMPLATE</div>}
                    {m.type === 'template' && <br />}
                    {m.type === 'template' && (() => {
                      const sent = renderSentTemplate(m, templatesByName);
                      return sent
                        ? <span>{sent}</span>
                        : <span style={{ opacity: 0.6, fontStyle: 'italic' }}>{m.template_name || 'Template message'}</span>;
                    })()}
                    {(m.type === 'audio' || m.type === 'voice') && m.media_url && (
                      <audio
                        src={m.media_url}
                        controls
                        preload="none"
                        style={{ width: isMobile ? 200 : 240, height: 36, display: 'block', marginBottom: m.body ? 7 : 2 }}
                      />
                    )}
                    {m.type === 'image' && m.media_url && (
                      <img src={m.media_url} alt={m.media_filename || 'image'} style={{ maxWidth: 240, width: '100%', borderRadius: 10, display: 'block', marginBottom: m.body ? 7 : 2 }} />
                    )}
                    {m.type === 'video' && m.media_url && (
                      <video src={m.media_url} controls style={{ maxWidth: 240, width: '100%', borderRadius: 10, display: 'block', marginBottom: m.body ? 7 : 2 }} />
                    )}
                    {m.type === 'document' && m.media_url && (
                      <a href={m.media_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', background: out ? 'rgba(255,255,255,.12)' : '#F2F6F3', borderRadius: 9, padding: '9px 11px', marginBottom: m.body ? 7 : 2, color: out ? '#EAF6E4' : 'var(--brand-primary)' }}>
                        <span style={{ fontSize: 18 }}>📄</span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>{m.media_filename || 'Document'}</span>
                      </a>
                    )}
                    {m.type !== 'template' && m.body && <span>{m.body}</span>}
                    {/* A voice note / photo / file carries no text, and without this
                        the bubble renders completely empty — the message looks lost. */}
                    {m.type !== 'template' && !m.body && !m.media_url && (
                      <span style={{ opacity: 0.75, fontStyle: 'italic' }}>{MEDIA_LABEL[m.type] || `${m.type} message`}</span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginTop: 5 }}>
                      <span style={{ fontSize: 10.5, color: out ? 'rgba(234,246,228,.6)' : 'rgba(27,76,94,.45)' }}>{m.timeStr}</span>
                      {out && (m.status === 'failed'
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 10, color: '#FCA5A5', fontWeight: 700 }}>Not sent</span>
                            <span title={friendlyError(m.error)} style={{ cursor: 'help', width: 14, height: 14, borderRadius: '50%', border: '1px solid #FCA5A5', color: '#FCA5A5', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>i</span>
                          </span>
                        : m.status === 'sending'
                          ? <span style={{ fontSize: 11, color: 'rgba(234,246,228,.65)' }}>🕓</span>
                          : <TickIcon status={m.status === 'read' ? 'read' : m.status === 'delivered' ? 'delivered' : 'sent'} />)}
                    </div>
                  </div>
                </motion.div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {sendError && <div style={{ background: '#FDE7E0', color: '#C7503B', fontSize: 12.5, fontWeight: 600, padding: '9px 20px' }}>{sendError}</div>}
          {uploading && <div style={{ background: '#EAF6E4', color: '#3B6B45', fontSize: 12.5, fontWeight: 600, padding: '9px 20px' }}>Uploading attachment…</div>}

          {composer}
        </>
      )}

      {tab === 'notes' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 14px' : '20px 24px', minHeight: 0 }}>
          {contact ? <ContactNotes contactId={contact.id} /> : <div style={{ color: 'rgba(27,76,94,.4)', fontSize: 13.5 }}>Select a conversation.</div>}
        </div>
      )}
    </>
  );

  // ── Reusable contact-detail content (side column on desktop, overlay on mobile) ──
  const contactDetail = contact ? (
    <>
      <div style={{ padding: '22px 20px 16px', textAlign: 'center', borderBottom: '1px solid rgba(27,76,94,.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--brand-primary)' }}>{contact.profile_name}</span>
          <TemperatureTag
            temp={contact.temperature} override={contact.temperature_override}
            contactId={contact.id} editable size="md"
            onChange={(t, o) => patchContact(contact.id, { temperature: t, temperature_override: o })}
          />
        </div>
        <div style={{ fontSize: 12, color: 'rgba(27,76,94,.55)', marginTop: 2 }}>{contact.jobTitle !== '-' ? contact.jobTitle + ' · ' : ''}{contact.company !== '-' ? contact.company : ''}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <div style={{ flex: 1, background: '#F2F8F2', border: '1px solid rgba(27,76,94,.10)', borderRadius: 10, padding: '9px 10px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)' }}>LEAD SCORE</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand-primary)', marginTop: 2 }}>{contact.lead_score}</div>
          </div>
          <div style={{ flex: 1, background: '#F2F8F2', border: '1px solid rgba(27,76,94,.10)', borderRadius: 10, padding: '9px 10px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)' }}>
              {pipelineOf(contact.lead_status) === 'deal' ? 'DEAL VALUE' : 'LEAD STATUS'}
            </div>
            {pipelineOf(contact.lead_status) === 'deal'
              ? <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand-primary)', marginTop: 3 }}>{formatCr(contact.deal_value_cr, { dash: 'Not set' })}</div>
              : <div style={{ marginTop: 5 }}><span style={leadChip(contact.lead_status)}>{contact.lead_status}</span></div>}
          </div>
        </div>
      </div>

      {/* Re-file the lead without leaving the chat. Mid-conversation is exactly
          when the stage changes, so the control belongs here and not only on
          the CRM board. */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(27,76,94,.08)' }}>
        <PipelineMover
          contactId={contact.id}
          stage={contact.lead_status}
          dealValue={contact.deal_value_cr}
          dealValueIsManual={contact.deal_value_is_manual}
          compact
          onMoved={(s, p) => patchContact(contact.id, { lead_status: s, pipeline: p })}
          onValueChange={(v, m) => patchContact(contact.id, { deal_value_cr: v, deal_value_is_manual: m })}
        />
      </div>
      <div style={{ padding: '16px 20px 24px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', color: 'var(--brand-primary)', marginBottom: 12 }}>CONTACT DETAILS</div>
        {[
          { label: 'Name', value: contact.profile_name },
          { label: 'Email', value: contact.email },
          { label: 'Phone', value: contact.phone },
          { label: 'Company', value: contact.company !== '-' ? contact.company : null },
          { label: 'Job Title', value: contact.jobTitle !== '-' ? contact.jobTitle : null },
        ].filter(f => f.value).map(f => (
          <div key={f.label} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(27,76,94,.45)', marginBottom: 4 }}>{f.label}</div>
            <div style={{ border: '1px solid rgba(27,76,94,.13)', borderRadius: 9, padding: '8px 11px', fontSize: 12.5, color: 'var(--brand-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.value}</div>
          </div>
        ))}
        <div style={{ marginTop: 6 }}><LeadAnswersEditable contactId={contact.id} attributes={contact.attributes} /></div>
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(27,76,94,.10)' }}>
          <LeadCustomFields contactId={contact.id} />
        </div>
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(27,76,94,.10)' }}>
          <LeadProperties contactId={contact.id} lead={contact} />
        </div>
      </div>
    </>
  ) : (
    <div style={{ padding: 24, color: 'rgba(27,76,94,.4)', fontSize: 14 }}>Select a conversation</div>
  );

  // ── Template picker modal (shared) ──
  const templateModal = (
    <AnimatePresence>
      {showTemplatePicker && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeTemplatePicker}
          style={{ position: 'fixed', inset: 0, background: 'rgba(14,58,53,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={e => e.stopPropagation()} style={{ position: 'relative', background: '#fff', borderRadius: 16, padding: 24, width: 'min(560px,94vw)', maxHeight: '76vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(14,58,53,.3)' }}>

            {/* Sending overlay — keeps the popup up with clear feedback until Meta confirms */}
            {sendingTpl && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,.85)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 13, zIndex: 5 }}>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                  style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid rgba(27,76,94,.18)', borderTopColor: 'var(--brand-primary)' }} />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--brand-primary)' }}>Sending template…</span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--brand-primary)' }}>{tplToFill ? 'Fill in the details' : 'Choose a template'}</span>
              <button onClick={closeTemplatePicker} disabled={sendingTpl} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#F2F6F3', cursor: sendingTpl ? 'default' : 'pointer', opacity: sendingTpl ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.55)' }}><IconX size={15} /></button>
            </div>
            {sendError && <div style={{ background: '#FDE7E0', color: '#C7503B', fontSize: 12.5, fontWeight: 600, padding: '9px 12px', borderRadius: 9, marginBottom: 14 }}>{sendError}</div>}

            {/* Step 2 — fill the template's variables, then send */}
            {tplToFill ? (
              <>
                <button onClick={() => { setTplToFill(null); setTplVars([]); }} style={{ background: 'none', border: 'none', color: '#3B6B45', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 12 }}>← Back to templates</button>
                <div style={{ background: '#F6FAF6', border: '1px solid rgba(27,76,94,.10)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 4 }}>{tplToFill.name}</div>
                  <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.65)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {tplToFill.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => (tplVars[Number(n) - 1] || `{{${n}}}`))}
                  </div>
                </div>
                {(tplToFill.header_type || '').toUpperCase() === 'IMAGE' && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(27,76,94,.5)', display: 'block', marginBottom: 5 }}>HEADER IMAGE · required</label>
                    <input ref={tplImgInputRef} type="file" accept="image/*" onChange={handleTplImageUpload} style={{ display: 'none' }} />
                    <button onClick={() => tplImgInputRef.current?.click()} disabled={tplImgUploading}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px dashed rgba(27,76,94,.35)', color: 'var(--brand-primary)', fontSize: 13, fontWeight: 700, padding: '10px 14px', borderRadius: 9, cursor: tplImgUploading ? 'default' : 'pointer' }}>
                      <IconClip size={16} /> {tplImgUploading ? 'Uploading…' : (tplImage ? 'Change image' : 'Upload image')}
                    </button>
                    {tplImage && <img src={tplImage} alt="" style={{ marginTop: 8, display: 'block', maxWidth: '100%', maxHeight: 120, borderRadius: 8, objectFit: 'cover' }} />}
                  </div>
                )}
                {tplVars.map((val, i) => (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(27,76,94,.5)', display: 'block', marginBottom: 5 }}>VARIABLE {`{{${i + 1}}}`}{i === 0 ? ' · usually the name' : ''}</label>
                    <input value={val} onChange={e => setTplVars(vs => vs.map((v, j) => (j === i ? e.target.value : v)))} placeholder={`Value for {{${i + 1}}}`}
                      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.18)', borderRadius: 9, padding: '10px 12px', fontSize: 14, color: 'var(--brand-primary)', outline: 'none', fontFamily: 'inherit' }} />
                  </div>
                ))}
                {(() => { const needsImage = (tplToFill.header_type || '').toUpperCase() === 'IMAGE'; const disabled = sendingTpl || tplVars.some(v => !v.trim()) || (needsImage && !tplImage.trim()); return (
                <button onClick={() => handleSendTemplate(tplToFill, tplVars, tplImage)} disabled={disabled}
                  style={{ width: '100%', marginTop: 4, background: disabled ? 'rgba(27,76,94,.30)' : 'var(--brand-primary)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 800, padding: '12px', borderRadius: 11, cursor: disabled ? 'default' : 'pointer' }}>
                  {sendingTpl ? 'Sending…' : 'Send template'}
                </button> ); })()}
              </>
            ) : (
              <>
                {pickerTemplates.length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.55)', lineHeight: 1.6 }}>No templates yet. Create them in the Templates screen (and sync from Meta), then they’ll appear here.</div>}
                {pickerTemplates.map(t => {
                  const approved = t.status === 'Approved';
                  const vars = templateVarCount(t.body);
                  return (
                    <div key={t.id || t.name} onClick={() => approved && onPickTemplate(t)}
                      style={{ border: '1px solid rgba(27,76,94,.14)', borderRadius: 12, padding: '12px 14px', marginBottom: 10, cursor: approved ? 'pointer' : 'not-allowed', opacity: approved ? 1 : 0.55 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--brand-primary)' }}>{t.name}{vars > 0 && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#B6743A', background: '#FFF1DC', padding: '2px 7px', borderRadius: 999 }}>{vars} field{vars > 1 ? 's' : ''}</span>}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: approved ? '#EAF6E4' : '#FFF1DC', color: approved ? '#3B6B45' : '#B6743A' }}>{t.status}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.65)', lineHeight: 1.5 }}>{t.body}</div>
                    </div>
                  );
                })}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ════════════════════════════ MOBILE LAYOUT ════════════════════════════
  if (isMobile) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#F1F6F1', position: 'relative' }}>
        {mobilePane === 'list' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff' }}>
            <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(27,76,94,.08)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand-primary)' }}>{isIg ? 'Instagram Inbox' : 'Inbox'} <span style={{ fontSize: 14, color: 'rgba(27,76,94,.45)', fontWeight: 700 }}>({visibleConvos.length})</span></span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setMobileFiltersOpen(true)} style={{ height: 36, padding: '0 13px', borderRadius: 9, border: '1px solid rgba(27,76,94,.14)', background: (inboxFilter !== 'all' || convStatus !== 'open' || readStatus !== '' || durFrom || durTo) ? '#EAF6E4' : '#fff', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--brand-primary)', fontSize: 12.5, fontWeight: 700 }}>
                    <IconFilter size={15} /> Filter
                  </button>
                  <button onClick={() => reloadConvos()} title="Refresh" style={{ width: 36, height: 36, borderRadius: 9, border: '1px solid rgba(27,76,94,.14)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(27,76,94,.6)' }}>
                    <IconRefresh size={16} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(27,76,94,.16)', borderRadius: 10, padding: '10px 12px', background: '#F9FBF9' }}>
                <span style={{ width: 16, height: 16, color: 'rgba(27,76,94,.4)', display: 'flex' }}><IconSearch size={16} /></span>
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search conversations…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 16, color: 'var(--brand-primary)', width: '100%', fontFamily: 'inherit' }} />
              </div>
            </div>
            {convoListBody}
          </div>
        )}

        {mobilePane === 'thread' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#F1F6F1' }}>
            {selConv ? (
              <>
                <div style={{ background: '#fff', borderBottom: '1px solid rgba(27,76,94,.10)', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setMobilePane('list')} style={{ width: 36, height: 36, borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-primary)', flexShrink: 0 }}>
                    <IconBack size={22} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }} onClick={() => setContactPanelOpen(true)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact?.profile_name}</span>
                      <TemperatureTag temp={contact?.temperature} override={contact?.temperature_override} />
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(27,76,94,.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selConv?.lastSeen ? `last seen ${relativeTime(selConv.lastSeen)}` : `${contact?.company !== '-' ? contact?.company + ' · ' : ''}WhatsApp`}
                    </div>
                  </div>
                  <button onClick={toggleConvStatus} title={selConv.status === 'closed' ? 'Reopen' : 'Close'} style={{ height: 34, padding: '0 11px', borderRadius: 8, border: '1px solid rgba(27,76,94,.16)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--brand-primary)', flexShrink: 0 }}>
                    {selConv.status === 'closed' ? 'Reopen' : 'Close'}
                  </button>
                  <button onClick={() => setContactPanelOpen(true)} title="Contact details" style={{ width: 36, height: 36, borderRadius: 9, border: '1px solid rgba(27,76,94,.14)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.6)', flexShrink: 0 }}>
                    <IconInfo size={18} />
                  </button>
                </div>
                {threadBody}
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.4)', fontSize: 14 }}>Select a conversation</div>
            )}
          </div>
        )}

        {/* Mobile filters sheet */}
        <AnimatePresence>
          {mobileFiltersOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileFiltersOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(14,58,53,.4)', zIndex: 250, display: 'flex', alignItems: 'flex-end' }}>
              <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '82vh', overflowY: 'auto', background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '10px 18px calc(20px + env(safe-area-inset-bottom))', boxShadow: '0 -12px 40px rgba(14,58,53,.22)' }}>
                <div style={{ width: 40, height: 4, borderRadius: 999, background: 'rgba(27,76,94,.18)', margin: '6px auto 14px' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--brand-primary)' }}>Filters</span>
                  <button onClick={() => setMobileFiltersOpen(false)} style={{ background: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Done</button>
                </div>
                {filtersInner}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile contact details overlay */}
        <AnimatePresence>
          {contactPanelOpen && mobilePane === 'thread' && contact && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setContactPanelOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(14,58,53,.4)', zIndex: 250, display: 'flex', justifyContent: 'flex-end' }}>
              <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 360, damping: 34 }}
                onClick={e => e.stopPropagation()} style={{ width: 'min(360px,90vw)', height: '100%', background: '#fff', overflowY: 'auto' }}>
                <div style={{ padding: '12px 16px 0', display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setContactPanelOpen(false)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#F2F6F3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.55)' }}><IconX size={16} /></button>
                </div>
                {contactDetail}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {templateModal}
      </div>
    );
  }

  // ════════════════════════════ DESKTOP LAYOUT ════════════════════════════
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <div style={{ display: 'flex', minHeight: '100%', height: '100%', minWidth: 1180 }}>

        {/* ── Left filter pane ── */}
        <div style={{ width: 216, flexShrink: 0, background: '#fff', borderRight: '1px solid rgba(27,76,94,.10)', overflowY: 'auto', padding: '16px 12px' }}>
          <div style={{ padding: '0 4px 12px' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--brand-primary)' }}>{isIg ? 'Instagram' : 'Inbox'}</span>
          </div>
          {filtersInner}
        </div>

        {/* ── Conversation list ── */}
        <div style={{ width: 316, flexShrink: 0, background: '#fff', borderRight: '1px solid rgba(27,76,94,.10)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(27,76,94,.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.04em', color: 'var(--brand-primary)' }}>{inboxFilter === 'flows' ? 'FLOWS' : 'ALL'} <span style={{ color: 'rgba(27,76,94,.45)', fontWeight: 700 }}>({visibleConvos.length})</span></span>
              <motion.span whileTap={{ scale: 0.9, rotate: -90 }} onClick={() => reloadConvos()} title="Refresh" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(27,76,94,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <span style={{ width: 15, height: 15, color: 'rgba(27,76,94,.6)', display: 'flex' }}><IconRefresh size={15} /></span>
              </motion.span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(27,76,94,.16)', borderRadius: 9, padding: '8px 11px', background: '#F9FBF9' }}>
              <span style={{ width: 14, height: 14, color: 'rgba(27,76,94,.4)', display: 'flex' }}><IconSearch size={14} /></span>
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search conversations…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--brand-primary)', width: '100%', fontFamily: 'inherit' }} />
            </div>
          </div>
          {convoListBody}
        </div>

        {/* ── Thread ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#F1F6F1' }}>
          {selConv ? (
            <>
              <div style={{ background: '#fff', borderBottom: '1px solid rgba(27,76,94,.10)', padding: '11px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--brand-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact?.profile_name}</span>
                      <TemperatureTag temp={contact?.temperature} override={contact?.temperature_override} />
                    </div>
                    <div style={{ fontSize: 11.5, color: 'rgba(27,76,94,.55)' }}>
                      {contact?.company !== '-' ? contact?.company + ' · ' : ''}WhatsApp
                      {selConv?.lastSeen && <> · last seen {relativeTime(selConv.lastSeen)}</>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={toggleConvStatus} title={selConv.status === 'closed' ? 'Reopen conversation' : 'Close conversation'} style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid rgba(27,76,94,.16)', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--brand-primary)' }}>
                    {selConv.status === 'closed' ? 'Reopen' : 'Close'}
                  </button>
                  <button onClick={() => setContactPanelOpen(o => !o)} title={contactPanelOpen ? 'Collapse details' : 'Expand details'} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(27,76,94,.14)', background: contactPanelOpen ? '#F2F8F2' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: contactPanelOpen ? 'var(--brand-primary)' : 'rgba(27,76,94,.45)', flexShrink: 0 }}>
                    <IconPanelClose />
                  </button>
                </div>
              </div>
              {threadBody}
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.4)', fontSize: 14 }}>Select a conversation</div>
          )}
        </div>

        {/* ── Contact panel ── */}
        {contactPanelOpen && <div style={{ width: 302, flexShrink: 0, background: '#fff', borderLeft: '1px solid rgba(27,76,94,.10)', overflowY: 'auto', minHeight: 0 }}>
          {contactDetail}
        </div>}
      </div>

      {templateModal}
    </div>
  );
}

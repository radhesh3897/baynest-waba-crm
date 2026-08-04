import { useState, useEffect } from 'react';
import { getSettings, saveSettings, getTemplatesLive } from '../liveData';
import { IconWhatsApp } from '../icons';
import { useIsMobile } from '../useIsMobile';

const WEBHOOK_URL = 'https://rkmngnkgesteohigvsxe.supabase.co/functions/v1/whatsapp-webhook';

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(27,76,94,.6)', display: 'block', marginBottom: 7, letterSpacing: '.03em' }}>{label}</label>
      {children}
    </div>
  );
}
const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.18)', borderRadius: 10, padding: '11px 13px', fontSize: 14, color: 'var(--brand-primary)', outline: 'none', fontFamily: 'inherit' };

export default function WhatsAppSettings() {
  const isMobile = useIsMobile();
  const [s, setS] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getSettings().then(d => setS(d || { business_name: '', business_number: '', auto_reply_enabled: false, auto_reply_template: '' }));
    getTemplatesLive().then(setTemplates);
  }, []);

  async function handleSave() {
    setSaving(true); setMsg('');
    const res = await saveSettings({
      business_name: s.business_name,
      business_number: s.business_number,
      auto_reply_enabled: s.auto_reply_enabled,
      auto_reply_template: s.auto_reply_template,
      ai_qualify_enabled: s.ai_qualify_enabled,
    });
    setSaving(false);
    setMsg(res.ok ? 'Settings saved.' : (res.error || 'Save failed'));
  }

  function copyWebhook() {
    navigator.clipboard?.writeText(WEBHOOK_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!s) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.5)', fontSize: 14 }}>Loading…</div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <header style={{ padding: isMobile ? '18px 16px 14px' : '22px 30px 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: 'rgba(27,76,94,.45)' }}>COLLECTIONS</div>
          <h1 style={{ margin: '5px 0 0', fontSize: 23, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--brand-primary)' }}>WhatsApp Settings</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {msg && <span style={{ fontSize: 12.5, fontWeight: 600, color: msg.includes('fail') ? '#C7503B' : '#3B6B45' }}>{msg}</span>}
          <button onClick={handleSave} disabled={saving} style={{ background: 'var(--brand-accent-soft)', border: 'none', color: 'var(--brand-primary-dark)', fontSize: 13, fontWeight: 800, padding: '10px 18px', borderRadius: 10, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </header>

      <div style={{ padding: isMobile ? '6px 16px 28px' : '6px 30px 40px', maxWidth: 680 }}>

        {/* Business identity */}
        <div style={{ background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 16, padding: 22, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 18 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EAF6E4', color: '#3B6B45', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}><IconWhatsApp size={20} /></div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-primary)' }}>Business profile</div>
              <div style={{ fontSize: 12, color: 'rgba(27,76,94,.55)' }}>How your WhatsApp number is identified.</div>
            </div>
          </div>
          <Field label="DISPLAY NAME">
            <input value={s.business_name || ''} onChange={e => setS({ ...s, business_name: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="BUSINESS NUMBER">
            <input value={s.business_number || ''} onChange={e => setS({ ...s, business_number: e.target.value })} style={inputStyle} />
          </Field>
        </div>

        {/* AI lead qualifier */}
        <div style={{ background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 16, padding: 22, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-primary)' }}>AI lead qualifier</span>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: 'var(--brand-primary-dark)', background: 'var(--brand-accent-soft)', padding: '2px 7px', borderRadius: 999 }}>AUTO</span>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(27,76,94,.55)', marginTop: 4, maxWidth: 460, lineHeight: 1.5 }}>
                Greets a first-time chat (a Click-to-WhatsApp ad tap), asks the 5 qualifying questions one at a time, then hands the chat to you and fires your Meta conversion event. It steps aside the moment you reply in a chat.
              </div>
            </div>
            <div onClick={() => setS({ ...s, ai_qualify_enabled: !s.ai_qualify_enabled })} style={{ width: 40, height: 23, borderRadius: 999, flexShrink: 0, position: 'relative', cursor: 'pointer', background: s.ai_qualify_enabled ? '#3B6B45' : 'rgba(27,76,94,.22)' }}>
              <span style={{ position: 'absolute', top: 2, left: s.ai_qualify_enabled ? 19 : 2, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
            </div>
          </div>
        </div>

        {/* Auto-reply */}
        <div style={{ background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 16, padding: 22, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: s.auto_reply_enabled ? 16 : 0 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-primary)' }}>Auto-reply to new leads</div>
              <div style={{ fontSize: 12, color: 'rgba(27,76,94,.55)', marginTop: 2 }}>Send a template automatically when a new lead comes in.</div>
            </div>
            <div onClick={() => setS({ ...s, auto_reply_enabled: !s.auto_reply_enabled })} style={{ width: 40, height: 23, borderRadius: 999, flexShrink: 0, position: 'relative', cursor: 'pointer', background: s.auto_reply_enabled ? '#3B6B45' : 'rgba(27,76,94,.22)' }}>
              <span style={{ position: 'absolute', top: 2, left: s.auto_reply_enabled ? 19 : 2, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
            </div>
          </div>
          {s.auto_reply_enabled && (
            <Field label="TEMPLATE TO SEND">
              <select value={s.auto_reply_template || ''} onChange={e => setS({ ...s, auto_reply_template: e.target.value })} style={{ ...inputStyle, fontWeight: 600 }}>
                <option value="">Choose a template…</option>
                {templates.map(t => <option key={t.id} value={t.name}>{t.name}{t.status !== 'Approved' ? ` (${t.status})` : ''}</option>)}
              </select>
            </Field>
          )}
        </div>

        {/* Connection / webhook */}
        <div style={{ background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 16, padding: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-primary)', marginBottom: 4 }}>Connection</div>
          <div style={{ fontSize: 12, color: 'rgba(27,76,94,.55)', marginBottom: 16 }}>Use this URL in Meta → WhatsApp → Configuration → Webhook.</div>
          <Field label="WEBHOOK URL">
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={WEBHOOK_URL} style={{ ...inputStyle, fontSize: 12.5, color: 'rgba(27,76,94,.7)', background: '#F6FAF6' }} />
              <button onClick={copyWebhook} style={{ flexShrink: 0, background: 'var(--brand-primary)', color: '#EAF6E4', border: 'none', fontSize: 12.5, fontWeight: 700, padding: '0 16px', borderRadius: 10, cursor: 'pointer' }}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
          </Field>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {['Schema deployed', 'Webhook live', 'Send-message live', 'Lead intake (n8n) live', 'Drip engine live', 'AI qualifier live'].map(t => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#3B6B45', background: '#EAF6E4', padding: '5px 11px', borderRadius: 999 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B6B45' }} />{t}
              </span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

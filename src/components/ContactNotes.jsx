import { useState, useEffect } from 'react';
import { getNotesLive, addNoteLive, deleteNoteLive } from '../liveData';

function fmtDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

// Humanize a raw Meta form-field key or short attribute key into a label.
const HIDE_KEYS = new Set(['meta_lead_id', 'tags', 'notes', 'source', 'form_id']);
function humanLabel(k) {
  return k.replace(/[_*]/g, ' ').replace(/\?+$/g, '').replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}
function humanValue(v) {
  return String(v).replace(/_/g, ' ');
}

// Read-only list of the captured lead answers (works regardless of how the
// keys are named — short n8n keys or raw Meta question keys).
export function LeadAnswers({ attributes }) {
  const entries = Object.entries(attributes || {}).filter(([k, v]) => !HIDE_KEYS.has(k) && v !== '' && v != null);
  if (!entries.length) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: 'var(--brand-primary)', marginBottom: 10 }}>LEAD ANSWERS</div>
      {entries.map(([k, v]) => (
        <div key={k} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(27,76,94,.45)', marginBottom: 3 }}>{humanLabel(k)}</div>
          <div style={{ border: '1px solid rgba(27,76,94,.13)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, color: 'var(--brand-primary)', fontWeight: 500, lineHeight: 1.45, wordBreak: 'break-word' }}>{humanValue(v)}</div>
        </div>
      ))}
    </div>
  );
}

// Zoho-style timestamped notes for a contact (call remarks, etc.).
export default function ContactNotes({ contactId }) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getNotesLive(contactId).then(n => { if (alive) { setNotes(n); setLoading(false); } });
    return () => { alive = false; };
  }, [contactId]);

  async function add() {
    const body = text.trim();
    if (!body || saving) return;
    setSaving(true);
    const res = await addNoteLive(contactId, body);
    setSaving(false);
    if (res.ok) { setNotes(ns => [res.note, ...ns]); setText(''); }
  }

  async function remove(id) {
    setNotes(ns => ns.filter(n => n.id !== id));
    await deleteNoteLive(id);
  }

  const canAdd = !!text.trim() && !saving;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: 'var(--brand-primary)', marginBottom: 10 }}>NOTES</div>

      <textarea
        value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); add(); } }}
        placeholder="Add a call note or remark…" rows={3}
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.18)', borderRadius: 9, padding: '9px 11px', fontSize: 13, color: 'var(--brand-primary)', fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.5 }}
      />
      <button onClick={add} disabled={!canAdd}
        style={{ marginTop: 8, width: '100%', background: canAdd ? 'var(--brand-accent-soft)' : 'rgba(27,76,94,.30)', color: 'var(--brand-primary-dark)', border: 'none', borderRadius: 9, padding: '9px', fontSize: 12.5, fontWeight: 800, cursor: canAdd ? 'pointer' : 'default' }}>
        {saving ? 'Saving…' : 'Add note'}
      </button>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {loading && <div style={{ fontSize: 12, color: 'rgba(27,76,94,.5)' }}>Loading notes…</div>}
        {!loading && notes.length === 0 && <div style={{ fontSize: 12, color: 'rgba(27,76,94,.45)', lineHeight: 1.5 }}>No notes yet. Log your first call remark above.</div>}
        {notes.map(n => (
          <div key={n.id} style={{ background: '#F6FAF6', border: '1px solid rgba(27,76,94,.1)', borderRadius: 10, padding: '10px 11px' }}>
            <div style={{ fontSize: 12.5, color: '#1B3A36', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{n.body}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
              <span style={{ fontSize: 10.5, color: 'rgba(27,76,94,.45)', fontWeight: 600 }}>{fmtDateTime(n.created_at)}</span>
              <button onClick={() => remove(n.id)} title="Delete note" style={{ border: 'none', background: 'transparent', color: 'rgba(199,80,59,.7)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { saveLeadAnswers } from '../liveData';
import { IconEdit, IconX } from '../icons';

// What a lead actually told us, editable.
//
// Answers live in two places: a few at the top level of attributes (city), and
// the rest nested under attributes.form_answers, which is where the Meta lead
// form's questions land. The old read-only view rendered that nested object
// through String(), so it showed "[object Object]" and every real answer was
// invisible. Here it is flattened, and each answer is saved back to wherever it
// came from.

// Internal plumbing, not something a person answered.
const HIDDEN = new Set([
  'meta_lead_id', 'tags', 'notes', 'source', 'form_id', 'custom',
  'skip_automation', 'form_answers', 'is_organic', 'platform',
]);
// Useful provenance, but not answers, so shown separately and not editable.
const CONTEXT = new Set(['form_name', 'campaign_name', 'ad_name', 'adset_name', 'lead_created_time']);

function label(k) {
  return String(k).replace(/[_*]/g, ' ').replace(/\?+$/g, '').replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}
function shownValue(v) {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).replace(/_/g, ' ');
}
function prettyTime(v) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return shownValue(v);
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function LeadAnswersEditable({ contactId, attributes, onSaved }) {
  const [attrs, setAttrs] = useState(attributes || {});
  const [editing, setEditing] = useState(null);   // key being edited
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { setAttrs(attributes || {}); }, [attributes]);

  // Flatten into one editable list, remembering where each answer lives so it
  // is written back to the same place.
  const answers = useMemo(() => {
    const out = [];
    for (const [k, v] of Object.entries(attrs || {})) {
      if (HIDDEN.has(k) || CONTEXT.has(k) || v === '' || v == null) continue;
      out.push({ key: k, value: v, nested: false });
    }
    const fa = attrs?.form_answers;
    if (fa && typeof fa === 'object' && !Array.isArray(fa)) {
      for (const [k, v] of Object.entries(fa)) {
        if (v === '' || v == null) continue;
        // A top-level key of the same name wins; do not show it twice.
        if (out.some(o => o.key === k)) continue;
        out.push({ key: k, value: v, nested: true });
      }
    }
    return out;
  }, [attrs]);

  const context = useMemo(
    () => Object.entries(attrs || {}).filter(([k, v]) => CONTEXT.has(k) && v !== '' && v != null),
    [attrs]);

  function startEdit(a) {
    setEditing(a.key);
    setDraft(typeof a.value === 'object' ? JSON.stringify(a.value) : String(a.value));
    setErr('');
  }

  async function commit(a) {
    const next = { ...attrs };
    if (a.nested) next.form_answers = { ...(next.form_answers || {}), [a.key]: draft };
    else next[a.key] = draft;

    setSaving(true); setErr('');
    const res = await saveLeadAnswers(contactId, next);
    setSaving(false);
    if (!res.ok) { setErr('Could not save. Try again.'); return; }
    setAttrs(next);
    setEditing(null);
    onSaved?.(next);
  }

  const head = { fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: 'var(--brand-primary)', marginBottom: 10 };
  const box = { border: '1px solid rgba(27,76,94,.13)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, color: 'var(--brand-primary)', fontWeight: 500, lineHeight: 1.45, wordBreak: 'break-word' };
  const input = { ...box, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', background: '#fff' };

  if (answers.length === 0 && context.length === 0) return null;

  return (
    <div style={{ marginBottom: 18 }}>
      {answers.length > 0 && (
        <>
          <div style={head}>LEAD ANSWERS</div>
          {answers.map(a => (
            <div key={a.key} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(27,76,94,.45)', flex: 1 }}>{label(a.key)}</span>
                {editing !== a.key && (
                  <button onClick={() => startEdit(a)} aria-label={`Edit ${label(a.key)}`}
                    style={{ border: 'none', background: 'transparent', color: 'rgba(27,76,94,.35)', cursor: 'pointer', display: 'flex', padding: 0 }}>
                    <IconEdit size={12} />
                  </button>
                )}
              </div>

              {editing === a.key ? (
                <div>
                  <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); commit(a); }
                      if (e.key === 'Escape') { e.preventDefault(); setEditing(null); }
                    }}
                    style={input} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button onClick={() => setEditing(null)}
                      style={{ flex: 1, border: '1px solid rgba(27,76,94,.18)', background: 'transparent', color: 'var(--brand-primary)', borderRadius: 8, fontSize: 12, fontWeight: 700, padding: '7px', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => commit(a)} disabled={saving}
                      style={{ flex: 1, border: 'none', background: 'var(--brand-primary)', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, padding: '7px', cursor: saving ? 'default' : 'pointer', opacity: saving ? .6 : 1 }}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={box}>{shownValue(a.value)}</div>
              )}
            </div>
          ))}
        </>
      )}

      {context.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(27,76,94,.08)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', color: 'rgba(27,76,94,.42)', textTransform: 'uppercase', marginBottom: 8 }}>Where this lead came from</div>
          {context.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11.5, marginBottom: 4 }}>
              <span style={{ color: 'rgba(27,76,94,.45)', minWidth: 92 }}>{label(k)}</span>
              <span style={{ color: 'rgba(27,76,94,.7)', fontWeight: 500, wordBreak: 'break-word' }}>
                {k === 'lead_created_time' ? prettyTime(v) : shownValue(v)}
              </span>
            </div>
          ))}
        </div>
      )}

      {err && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#C7503B', fontWeight: 600, marginTop: 8 }}>
          <IconX size={12} />{err}
        </div>
      )}
    </div>
  );
}

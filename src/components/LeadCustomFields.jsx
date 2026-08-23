import { useState, useEffect } from 'react';
import { getLeadExtras, saveLeadExtras } from '../liveData';
import { IconPlus, IconX, IconTag } from '../icons';

// Tags and custom fields for one lead, used in both the Inbox contact panel and
// the CRM lead pop-up so anything captured in a chat is visible in the CRM.
//
// Tags answer "what kind of lead is this" (NRI, investor, urgent). Custom fields
// answer "what did they actually tell us" (budget, possession, loan needed) for
// anything the lead form never asked.
export default function LeadCustomFields({ contactId }) {
  const [tags, setTags] = useState([]);
  const [custom, setCustom] = useState({});
  const [loading, setLoading] = useState(true);
  const [tagInput, setTagInput] = useState('');
  const [addingField, setAddingField] = useState(false);
  const [fk, setFk] = useState('');
  const [fv, setFv] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getLeadExtras(contactId).then(e => {
      if (!alive) return;
      setTags(e.tags); setCustom(e.custom); setLoading(false);
    });
    return () => { alive = false; };
  }, [contactId]);

  // Persist immediately, but roll the UI back if the write fails, so what is on
  // screen always matches what is stored.
  async function persist(nextTags, nextCustom) {
    const prevTags = tags, prevCustom = custom;
    setTags(nextTags); setCustom(nextCustom);
    setSaving(true); setErr('');
    const res = await saveLeadExtras(contactId, { tags: nextTags, custom: nextCustom });
    setSaving(false);
    if (!res.ok) {
      setTags(prevTags); setCustom(prevCustom);
      setErr('Could not save. Try again.');
    }
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    // Case-insensitive dedupe: "NRI" and "nri" are the same tag to a person.
    if (tags.some(x => x.toLowerCase() === t.toLowerCase())) { setTagInput(''); return; }
    persist([...tags, t], custom);
    setTagInput('');
  }
  const removeTag = t => persist(tags.filter(x => x !== t), custom);

  function addField() {
    const k = fk.trim();
    if (!k) return;
    persist(tags, { ...custom, [k]: fv.trim() });
    setFk(''); setFv(''); setAddingField(false);
  }
  function removeField(k) {
    const next = { ...custom };
    delete next[k];
    persist(tags, next);
  }

  const head = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', color: 'rgba(27,76,94,.5)', textTransform: 'uppercase' };
  const input = { boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.18)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, color: 'var(--brand-primary)', fontFamily: 'inherit', background: '#fff', outline: 'none' };

  if (loading) return <div style={{ fontSize: 12, color: 'rgba(27,76,94,.4)' }}>Loading…</div>;

  const entries = Object.entries(custom);

  return (
    <div>
      {/* Tags */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
        <span style={{ display: 'flex', color: 'rgba(27,76,94,.45)' }}><IconTag size={13} /></span>
        <span style={head}>Tags</span>
        {saving && <span style={{ fontSize: 10.5, color: 'rgba(27,76,94,.4)', marginLeft: 'auto' }}>Saving…</span>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 9 }}>
        {tags.length === 0 && <span style={{ fontSize: 12, color: 'rgba(27,76,94,.4)' }}>No tags yet</span>}
        {tags.map(t => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(192,138,69,.16)', color: '#8A5E22', fontSize: 11.5, fontWeight: 700, padding: '4px 8px 4px 10px', borderRadius: 999 }}>
            {t}
            <button onClick={() => removeTag(t)} aria-label={`Remove ${t}`}
              style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'flex', padding: 0, opacity: .65 }}>
              <IconX size={11} />
            </button>
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <input value={tagInput} onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder="Add a tag, e.g. NRI"
          style={{ ...input, flex: 1, minWidth: 0 }} />
        <button onClick={addTag} style={{ border: 'none', background: 'rgba(27,76,94,.08)', color: 'var(--brand-primary)', borderRadius: 8, padding: '0 11px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <IconPlus size={13} />
        </button>
      </div>

      {/* Custom fields */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={head}>Custom fields</span>
        {!addingField && (
          <button onClick={() => setAddingField(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: 'var(--brand-primary)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            <IconPlus size={12} /> Add
          </button>
        )}
      </div>

      {entries.length === 0 && !addingField && (
        <div style={{ fontSize: 12, color: 'rgba(27,76,94,.4)', marginBottom: 4 }}>
          Nothing added yet. Use this for anything the lead tells you that the form did not ask.
        </div>
      )}

      {entries.map(([k, v]) => (
        <div key={k} style={{ marginBottom: 9 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.03em', color: 'rgba(27,76,94,.45)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
            <button onClick={() => removeField(k)} aria-label={`Remove ${k}`}
              style={{ border: 'none', background: 'transparent', color: 'rgba(27,76,94,.35)', cursor: 'pointer', display: 'flex', padding: 0 }}>
              <IconX size={11} />
            </button>
          </div>
          <div style={{ border: '1px solid rgba(27,76,94,.13)', borderRadius: 9, padding: '8px 11px', fontSize: 12.5, color: 'var(--brand-primary)', fontWeight: 500, wordBreak: 'break-word' }}>
            {String(v) || <span style={{ color: 'rgba(27,76,94,.35)' }}>empty</span>}
          </div>
        </div>
      ))}

      {addingField && (
        <div style={{ background: 'rgba(27,76,94,.04)', borderRadius: 10, padding: 10, marginTop: 4 }}>
          <input value={fk} onChange={e => setFk(e.target.value)} placeholder="Field name, e.g. Loan required"
            style={{ ...input, width: '100%', marginBottom: 6 }} />
          <input value={fv} onChange={e => setFv(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addField(); } }}
            placeholder="Value, e.g. Yes, 60%"
            style={{ ...input, width: '100%', marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { setAddingField(false); setFk(''); setFv(''); }}
              style={{ flex: 1, border: '1px solid rgba(27,76,94,.18)', background: 'transparent', color: 'var(--brand-primary)', borderRadius: 8, fontSize: 12, fontWeight: 700, padding: '8px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={addField}
              style={{ flex: 1, border: 'none', background: 'var(--brand-primary)', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, padding: '8px', cursor: 'pointer' }}>Save field</button>
          </div>
        </div>
      )}

      {err && <div style={{ fontSize: 11.5, color: '#C7503B', fontWeight: 600, marginTop: 8 }}>{err}</div>}
    </div>
  );
}

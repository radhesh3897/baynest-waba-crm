import { useState, useRef, useEffect } from 'react';
import { tempStyle, TEMPERATURES, TEMP_RULE } from '../pipeline';
import { setLeadTemperature } from '../liveData';

// The hot / warm / cold tag that rides along with the lead's name everywhere.
//
// Read-only by default — it is a label, not a control, in a list of forty rows.
// Pass `editable` in the places where Manish has the lead open and is allowed to
// disagree with the automatic call.
export default function TemperatureTag({
  temp, override = null, contactId = null, editable = false,
  size = 'sm', onChange, style: extra,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [val, setVal] = useState(temp || 'cold');
  const [ovr, setOvr] = useState(override);
  const wrapRef = useRef(null);

  useEffect(() => { setVal(temp || 'cold'); setOvr(override); }, [temp, override]);

  useEffect(() => {
    if (!open) return;
    const away = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const esc  = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const c = tempStyle(val);
  const big = size === 'md';
  const pill = {
    display: 'inline-flex', alignItems: 'center', gap: big ? 6 : 5,
    background: c.bg, color: c.fg, borderRadius: 999,
    fontSize: big ? 12 : 10.5, fontWeight: 800, letterSpacing: '.02em',
    padding: big ? '4px 11px' : '2px 8px',
    border: 'none', fontFamily: 'inherit', flexShrink: 0,
    cursor: editable ? 'pointer' : 'default',
    ...extra,
  };

  async function pick(next) {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    const prevVal = val, prevOvr = ovr;
    // Optimistic: the tag is on screen next to the name, a spinner there reads
    // as breakage. Roll back if the write fails.
    if (next !== 'auto') { setVal(next); setOvr(next); }
    const res = await setLeadTemperature(contactId, next === 'auto' ? null : next);
    if (res.ok) {
      setVal(res.temperature || next);
      setOvr(res.temperature_override ?? null);
      onChange?.(res.temperature || next, res.temperature_override ?? null);
    } else {
      setVal(prevVal); setOvr(prevOvr);
      alert('Could not change the tag: ' + (res.error || 'unknown error'));
    }
    setBusy(false);
  }

  const body = (
    <>
      <span style={{ width: big ? 7 : 6, height: big ? 7 : 6, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {c.label}
      {/* A dot means Manish set this by hand, so nobody wonders why the rule
          disagrees with the label. */}
      {ovr && <span title="Set manually" style={{ opacity: .5, fontSize: big ? 11 : 9.5, fontWeight: 700 }}>·</span>}
    </>
  );

  if (!editable || !contactId) return <span style={pill}>{body}</span>;

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        disabled={busy} title="Change tag" style={{ ...pill, opacity: busy ? .55 : 1 }}>
        {body}
      </button>

      {open && (
        <div onClick={e => e.stopPropagation()} style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 300,
          background: '#fff', border: '1px solid rgba(27,76,94,.14)', borderRadius: 12,
          boxShadow: '0 12px 30px rgba(14,58,53,.18)', overflow: 'hidden', width: 232,
        }}>
          {TEMPERATURES.map(t => {
            const s = tempStyle(t);
            const on = val === t;
            return (
              <button key={t} type="button" onClick={() => pick(t)} style={{
                display: 'flex', alignItems: 'flex-start', gap: 9, width: '100%', textAlign: 'left',
                padding: '9px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: on ? 'var(--brand-tint-soft, #F2F8F2)' : '#fff',
                borderBottom: '1px solid rgba(27,76,94,.06)',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, flexShrink: 0, marginTop: 4 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: on ? 800 : 600, color: 'var(--brand-primary)' }}>{s.label}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'rgba(27,76,94,.5)', lineHeight: 1.35, marginTop: 1 }}>{TEMP_RULE[t]}</span>
                </span>
              </button>
            );
          })}
          <button type="button" onClick={() => pick('auto')} style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            background: ovr ? '#fff' : 'var(--brand-tint-soft, #F2F8F2)',
            fontSize: 11.5, fontWeight: ovr ? 600 : 800, color: 'rgba(27,76,94,.7)',
          }}>
            {ovr ? 'Back to automatic' : 'Automatic (from budget + timeline)'}
          </button>
        </div>
      )}
    </span>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { getReminders, completeReminder, cancelReminder, REMINDER_KINDS } from '../liveData';
import ReminderModal from './ReminderModal';

const FOREST = 'var(--brand-primary)';

const kindOf = (k) => REMINDER_KINDS.find((x) => x.key === k) || REMINDER_KINDS[0];

function whenLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (sameDay) return `Today ${time}`;
  if (d.toDateString() === tmr.toDateString()) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${time}`;
}

// Sync state matters to the user only when it has gone wrong: a reminder that
// never reached the calendar will not ring, and silently pretending otherwise
// is the one failure mode worth surfacing in the UI.
function SyncNote({ r }) {
  if (r.sync_status === 'synced') {
    return <span style={{ fontSize: 11, color: 'rgba(27,76,94,.42)' }}>In Google Calendar</span>;
  }
  if (r.sync_status === 'failed') {
    return (
      <span title={r.sync_error || ''} style={{ fontSize: 11, color: '#B4541F', fontWeight: 700 }}>
        Not in calendar — retrying
      </span>
    );
  }
  return <span style={{ fontSize: 11, color: 'rgba(27,76,94,.42)' }}>Adding to calendar…</span>;
}

export default function LeadReminders({ contact }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    if (!contact?.id) return;
    getReminders(contact.id).then((r) => { setRows(r); setLoading(false); });
  }, [contact?.id]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function mark(r, action) {
    // Optimistic: the row disappears (or ticks) immediately, then reconciles.
    setRows((prev) => (action === 'done'
      ? prev.map((x) => (x.id === r.id ? { ...x, status: 'done' } : x))
      : prev.filter((x) => x.id !== r.id)));
    try { await (action === 'done' ? completeReminder(r.id) : cancelReminder(r.id)); }
    finally { load(); }
  }

  const open = rows.filter((r) => r.status === 'open');
  const done = rows.filter((r) => r.status === 'done');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: FOREST }}>REMINDERS</div>
        <button
          onClick={() => setComposing(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 12px',
            borderRadius: 10, border: `1px solid ${FOREST}`, background: '#fff', color: FOREST,
            fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
          }}
        >
          + Add
        </button>
      </div>

      {loading && <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.45)' }}>Loading…</div>}

      {!loading && !rows.length && (
        <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.5)', lineHeight: 1.5 }}>
          No reminders yet. Add one and it lands on the Google Calendar with an alert.
        </div>
      )}

      {open.map((r) => {
        const overdue = new Date(r.due_at).getTime() < Date.now();
        const k = kindOf(r.kind);
        return (
          <div
            key={r.id}
            style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', marginBottom: 8,
              border: `1px solid ${overdue ? 'rgba(180,84,31,.32)' : 'rgba(27,76,94,.13)'}`,
              background: overdue ? '#FDF3EE' : '#fff', borderRadius: 12,
            }}
          >
            <span aria-hidden style={{ fontSize: 16, lineHeight: '20px', flexShrink: 0 }}>{k.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#123642', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: overdue ? '#B4541F' : 'rgba(27,76,94,.66)' }}>
                  {overdue ? 'Overdue · ' : ''}{whenLabel(r.due_at)}
                </span>
                <SyncNote r={r} />
              </div>
              {r.notes && (
                <div style={{ fontSize: 12, color: 'rgba(27,76,94,.6)', marginTop: 4, lineHeight: 1.45 }}>{r.notes}</div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => mark(r, 'done')} style={miniBtn(true)}>Done</button>
                <button onClick={() => setEditing(r)} style={miniBtn(false)}>Edit</button>
                <button onClick={() => mark(r, 'cancel')} style={miniBtn(false)}>Remove</button>
                {r.google_link && (
                  <a href={r.google_link} target="_blank" rel="noreferrer" style={{ ...miniBtn(false), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                    Calendar
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {done.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(27,76,94,.4)', marginBottom: 6 }}>DONE</div>
          {done.slice(0, 5).map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', fontSize: 12.5, color: 'rgba(27,76,94,.45)' }}>
              <span aria-hidden>✓</span>
              <span style={{ textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
            </div>
          ))}
        </div>
      )}

      {composing && (
        <ReminderModal contact={contact} onClose={() => setComposing(false)} onSaved={load} />
      )}
      {editing && (
        <ReminderModal contact={contact} reminder={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </div>
  );
}

const miniBtn = (primary) => ({
  minHeight: 32, padding: '0 11px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 12, fontWeight: 700,
  border: `1px solid ${primary ? 'rgba(46,158,79,.34)' : 'rgba(27,76,94,.16)'}`,
  background: primary ? '#EAF6E4' : '#fff',
  color: primary ? '#3B6B45' : 'rgba(27,76,94,.65)',
});

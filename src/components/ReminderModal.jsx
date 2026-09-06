import { useState, useEffect, useMemo } from 'react';
import { IconX } from '../icons';
import { useIsMobile } from '../useIsMobile';
import { REMINDER_KINDS, createReminder, updateReminder } from '../liveData';

const FOREST = 'var(--brand-primary)';
const LINE = 'rgba(27,76,94,.14)';

// ── Local time helpers ──────────────────────────────────────────────────────
// <input type="datetime-local"> speaks WALL-CLOCK time with no zone, while the
// database stores UTC. toISOString() would shift by the offset (IST is +5:30,
// so 3pm would be saved as 9:30am). These two convert explicitly instead.
const pad = (n) => String(n).padStart(2, '0');

function toLocalInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s) {
  const [date, time] = String(s).split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0); // constructed in the browser's zone
}

// Round up to the next 15 minutes, so the default never reads "3:07pm".
function nextQuarterHour(from = new Date()) {
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15);
  return d;
}

function atTime(dayOffset, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Quick picks cover the overwhelming majority of real reminders. Anything past
// 8pm today is dropped — offering "today 5pm" at 9pm is noise, not a shortcut.
function quickPicks() {
  const now = new Date();
  const out = [{ label: 'In 1 hour', date: nextQuarterHour(new Date(now.getTime() + 3600e3)) }];
  if (now.getHours() < 14) out.push({ label: 'Today 3pm', date: atTime(0, 15) });
  if (now.getHours() < 17) out.push({ label: 'Today 6pm', date: atTime(0, 18) });
  out.push({ label: 'Tomorrow 10am', date: atTime(1, 10) });
  out.push({ label: 'Tomorrow 3pm', date: atTime(1, 15) });
  out.push({ label: 'In 3 days', date: atTime(3, 11) });
  return out;
}

const fmtWhen = (d) =>
  d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

/**
 * Create or edit a reminder on a lead.
 * Pass `reminder` to edit an existing one, or `contact` to create a new one.
 */
export default function ReminderModal({ contact, reminder, onClose, onSaved }) {
  const isMobile = useIsMobile();
  const editing = !!reminder;

  const leadName = contact?.name || contact?.phone || reminder?.contacts?.name || 'this lead';

  const [kind, setKind] = useState(reminder?.kind || 'call');
  const [title, setTitle] = useState(reminder?.title || '');
  const [notes, setNotes] = useState(reminder?.notes || '');
  const [when, setWhen] = useState(
    toLocalInput(reminder?.due_at ? new Date(reminder.due_at) : nextQuarterHour(atTime(0, new Date().getHours() + 1))),
  );
  const [duration, setDuration] = useState(reminder?.duration_min ?? 30);
  const [remindBefore, setRemindBefore] = useState(reminder?.remind_min_before ?? 10);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const picks = useMemo(quickPicks, []);

  // The title writes itself from the kind and the lead, so the common case is
  // pick-a-time-and-save. Only stop auto-filling once it has been hand-edited.
  const [titleTouched, setTitleTouched] = useState(editing);
  useEffect(() => {
    if (titleTouched) return;
    const label = REMINDER_KINDS.find((k) => k.key === kind)?.label || 'Follow up';
    setTitle(`${label} — ${leadName}`);
  }, [kind, leadName, titleTouched]);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const dueDate = fromLocalInput(when);
  const inPast = dueDate.getTime() < Date.now() - 60_000;

  async function save() {
    if (!title.trim()) { setError('Give the reminder a title.'); return; }
    if (Number.isNaN(dueDate.getTime())) { setError('That date and time is not valid.'); return; }
    setSaving(true); setError('');
    try {
      const saved = editing
        ? await updateReminder(reminder.id, {
            title: title.trim(), notes: notes.trim() || null, kind,
            dueAt: dueDate, duration_min: Number(duration), remind_min_before: Number(remindBefore),
          })
        : await createReminder({
            contactId: contact?.id, title: title.trim(), notes: notes.trim() || null, kind,
            dueAt: dueDate, durationMin: Number(duration), remindMinBefore: Number(remindBefore),
          });
      onSaved?.(saved);
      onClose?.();
    } catch (e) {
      setError(e.message || 'Could not save the reminder.');
      setSaving(false);
    }
  }

  const field = {
    width: '100%', boxSizing: 'border-box', padding: '11px 12px', fontSize: 15,
    border: `1px solid ${LINE}`, borderRadius: 10, background: '#fff',
    color: '#123642', fontFamily: 'inherit', minHeight: 44,
  };
  const label = { fontSize: 11.5, fontWeight: 800, letterSpacing: .3, color: 'rgba(27,76,94,.5)', display: 'block', marginBottom: 6, textTransform: 'uppercase' };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,32,40,.46)', zIndex: 1200,
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
        padding: isMobile ? 0 : 20,
      }}
    >
      <div
        className="fade-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex', flexDirection: 'column', background: '#F7F9FA', width: '100%',
          maxWidth: isMobile ? '100%' : 460,
          borderRadius: isMobile ? '18px 18px 0 0' : 16,
          maxHeight: isMobile ? '92vh' : '88vh', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(10,32,40,.28)',
        }}
      >
        {/* Sticky header: the close button stays reachable however far you scroll. */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 3, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 10, padding: '12px 10px 12px 16px',
          background: '#fff', borderBottom: `1px solid ${LINE}`,
        }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#123642' }}>
            {editing ? 'Edit reminder' : 'New reminder'}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(27,76,94,.6)',
              borderRadius: 10, flexShrink: 0,
            }}
          >
            <IconX size={19} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.6)', marginBottom: 14 }}>
            For <strong style={{ color: '#123642' }}>{leadName}</strong>
          </div>

          {/* Kind */}
          <div style={{ marginBottom: 16 }}>
            <span style={label}>Type</span>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {REMINDER_KINDS.map((k) => {
                const on = kind === k.key;
                return (
                  <button
                    key={k.key}
                    onClick={() => setKind(k.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '9px 13px',
                      fontSize: 13, fontWeight: 700, borderRadius: 999, cursor: 'pointer',
                      border: `1px solid ${on ? FOREST : LINE}`,
                      background: on ? FOREST : '#fff', color: on ? '#fff' : 'rgba(27,76,94,.72)',
                    }}
                  >
                    <span aria-hidden>{k.icon}</span>{k.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick times */}
          <div style={{ marginBottom: 16 }}>
            <span style={label}>When</span>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
              {picks.map((p) => {
                const on = Math.abs(fromLocalInput(when).getTime() - p.date.getTime()) < 60_000;
                return (
                  <button
                    key={p.label}
                    onClick={() => setWhen(toLocalInput(p.date))}
                    style={{
                      minHeight: 38, padding: '8px 12px', fontSize: 12.5, fontWeight: 700,
                      borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
                      border: `1px solid ${on ? FOREST : LINE}`,
                      background: on ? 'rgba(27,76,94,.08)' : '#fff',
                      color: on ? FOREST : 'rgba(27,76,94,.7)',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={field} />
            {inPast && (
              <div style={{ fontSize: 12, color: '#B4541F', marginTop: 7 }}>
                That time has already passed — the calendar event will be created, but no alert can fire.
              </div>
            )}
          </div>

          {/* Title */}
          <div style={{ marginBottom: 16 }}>
            <span style={label}>Title</span>
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
              placeholder="Call Rajesh about the Worli flat"
              style={field}
            />
          </div>

          {/* Duration + alert */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={label}>Length</span>
              <select value={duration} onChange={(e) => setDuration(e.target.value)} style={field}>
                {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={label}>Alert me</span>
              <select value={remindBefore} onChange={(e) => setRemindBefore(e.target.value)} style={field}>
                <option value={0}>At the time</option>
                <option value={10}>10 min before</option>
                <option value={30}>30 min before</option>
                <option value={60}>1 hour before</option>
                <option value={1440}>1 day before</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 4 }}>
            <span style={label}>Notes <span style={{ textTransform: 'none', fontWeight: 600 }}>(optional)</span></span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="What this call is about…"
              style={{ ...field, resize: 'vertical', lineHeight: 1.45 }}
            />
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: '#FCEDE9', color: '#8C2F14', fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>

        {/* Sticky footer, clear of the iOS home indicator. */}
        <div style={{
          borderTop: `1px solid ${LINE}`, background: '#fff',
          padding: `12px 16px calc(12px + env(safe-area-inset-bottom))`,
          display: 'flex', gap: 10,
        }}>
          <button
            onClick={onClose}
            style={{
              flex: '0 0 auto', minHeight: 48, padding: '0 18px', fontSize: 14.5, fontWeight: 700,
              border: `1px solid ${LINE}`, borderRadius: 12, background: '#fff',
              color: 'rgba(27,76,94,.7)', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{
              flex: 1, minHeight: 48, fontSize: 15, fontWeight: 800, border: 'none', borderRadius: 12,
              background: saving ? 'rgba(27,76,94,.45)' : FOREST, color: '#fff',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : `Remind me ${fmtWhen(dueDate)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { getVisits, createVisit, updateVisit, getPeopleLive, getProperties } from '../liveData';
import { useIsMobile } from '../useIsMobile';
import { IconPlus, IconCalendar, IconX } from '../icons';
import SearchSelect from '../components/SearchSelect';
import TemperatureTag from '../components/TemperatureTag';
import { tempStyle } from '../pipeline';

const CARD = { background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 14 };

const STATUS_STYLE = {
  scheduled: { bg: 'rgba(27,76,94,.10)',    fg: 'var(--brand-primary)', label: 'Scheduled' },
  done:      { bg: 'rgba(115,167,111,.22)', fg: '#3B6B45',              label: 'Done' },
  cancelled: { bg: 'rgba(27,76,94,.05)',    fg: 'rgba(27,76,94,.45)',   label: 'Cancelled' },
  no_show:   { bg: 'rgba(199,80,59,.12)',   fg: '#9A3F2C',              label: 'No show' },
};

// Times are stored as timestamptz; render in IST, which is the only timezone
// this team operates in.
const IST = { timeZone: 'Asia/Kolkata' };
function whenLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-IN', { ...IST, day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { ...IST, hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date} · ${time}`;
}
// "In 3 hours" reads better than a timestamp for something imminent.
function relative(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  const mins = Math.round(ms / 60000);
  if (mins < 0) return '';
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs} hr${hrs === 1 ? '' : 's'}`;
  const days = Math.round(hrs / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

// datetime-local needs "YYYY-MM-DDTHH:mm" in local time, not an ISO string.
function toLocalInput(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ScheduleDrawer({ onClose, onSaved, isMobile }) {
  const [leads, setLeads] = useState([]);
  const [props, setProps] = useState([]);
  const [form, setForm] = useState(() => {
    const t = new Date(Date.now() + 24 * 3600_000);
    t.setMinutes(0, 0, 0);
    return { contact_id: '', property_id: '', scheduled_at: toLocalInput(t), duration_mins: 60, location: '', notes: '' };
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    getPeopleLive().then(l => setLeads(l || []));
    getProperties().then(p => setProps(p || []));
  }, []);

  // Phone shows as the secondary line so two people with the same name are
  // still distinguishable, and searching a number finds the lead.
  // getPeopleLive already resolves profile_name and exposes the number as
  // `phone`, so the number is only shown when it adds something the name does
  // not already say.
  const leadOptions = useMemo(() => leads.map(l => ({
    value: l.id,
    label: l.profile_name || 'Unknown',
    sub: [l.phone && l.phone !== l.profile_name ? l.phone : '', tempStyle(l.temperature).label]
      .filter(Boolean).join(' · '),
  })), [leads]);

  const propertyOptions = useMemo(() => props.map(p => ({
    value: p.id,
    label: p.name,
    sub: [p.developer, p.area].filter(Boolean).join(' · '),
  })), [props]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.contact_id) return setErr('Pick a lead first.');
    if (!form.scheduled_at) return setErr('Pick a date and time.');
    setSaving(true); setErr('');
    const res = await createVisit({ ...form, scheduled_at: new Date(form.scheduled_at).toISOString() });
    setSaving(false);
    if (!res.ok) return setErr(res.error || 'Could not save the visit.');
    onSaved();
  }

  const input = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.18)', borderRadius: 9, padding: '9px 11px', fontSize: 13.5, color: 'var(--brand-primary)', fontFamily: 'inherit', background: '#fff', outline: 'none' };
  const label = { fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: 'rgba(27,76,94,.5)', textTransform: 'uppercase', display: 'block', marginBottom: 5, marginTop: 13 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(14,58,53,.35)', zIndex: 80, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', width: isMobile ? '100%' : 460, height: '100%', overflowY: 'auto', padding: isMobile ? '18px 16px 40px' : '22px 26px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--brand-primary)' }}>Schedule a visit</h2>
          <button onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, borderRadius: 8, border: 'none', background: '#F2F6F3', cursor: 'pointer', color: 'rgba(27,76,94,.55)' }}><IconX size={19} /></button>
        </div>

        <label style={label}>Lead</label>
        <SearchSelect
          options={leadOptions}
          value={form.contact_id}
          onChange={v => set('contact_id', v)}
          placeholder="Choose a lead…"
          searchPlaceholder="Search by name or number…"
          emptyLabel="No lead matches that search"
        />

        <label style={label}>Property</label>
        <SearchSelect
          options={propertyOptions}
          value={form.property_id}
          onChange={v => set('property_id', v)}
          placeholder="No specific project"
          searchPlaceholder="Search projects…"
          emptyLabel="No project matches"
        />

        <label style={label}>Date and time</label>
        <input type="datetime-local" value={form.scheduled_at} onChange={e => set('scheduled_at', e.target.value)} style={input} />

        <label style={label}>Duration (minutes)</label>
        <input type="number" min="15" step="15" value={form.duration_mins} onChange={e => set('duration_mins', e.target.value)} style={input} />

        <label style={label}>Meeting point</label>
        <input value={form.location} onChange={e => set('location', e.target.value)} placeholder="Site office, gate 2" style={input} />

        <label style={label}>Notes</label>
        <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything the team should know before the visit" style={{ ...input, resize: 'vertical' }} />

        <div style={{ fontSize: 11.5, color: 'rgba(27,76,94,.5)', marginTop: 10, lineHeight: 1.5 }}>
          A reminder is set for 2 hours before. Once Google Calendar is connected, this visit will also appear there.
        </div>

        {err && <div style={{ marginTop: 12, fontSize: 12.5, color: '#C7503B', fontWeight: 600 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex: 1, border: '1px solid rgba(27,76,94,.18)', background: 'transparent', color: 'var(--brand-primary)', borderRadius: 10, fontSize: 13.5, fontWeight: 700, padding: '11px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ flex: 1, border: 'none', background: 'var(--brand-primary)', color: '#fff', borderRadius: 10, fontSize: 13.5, fontWeight: 800, padding: '11px', cursor: saving ? 'default' : 'pointer', opacity: saving ? .6 : 1 }}>
            {saving ? 'Saving…' : 'Schedule visit'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Visits() {
  const isMobile = useIsMobile();
  const [scope, setScope] = useState('upcoming');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  async function load(s = scope) {
    setLoading(true);
    setRows(await getVisits(s));
    setLoading(false);
  }
  useEffect(() => { load(scope); }, [scope]);

  async function mark(id, status) {
    await updateVisit(id, { status });
    load(scope);
  }

  const pill = (active) => ({ padding: '9px 15px', minHeight: 38, borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: 'none', background: active ? 'var(--brand-primary)' : 'rgba(27,76,94,.06)', color: active ? '#fff' : 'rgba(27,76,94,.7)' });

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobile ? '18px 14px 32px' : '26px 30px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? 21 : 26, fontWeight: 800, color: 'var(--brand-primary)', letterSpacing: '-.01em' }}>Visits</h1>
          <span style={{ fontSize: isMobile ? 12.5 : 14, color: 'rgba(27,76,94,.45)', fontWeight: 600 }}>{rows.length}</span>
        </div>
        <button onClick={() => setAdding(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'var(--brand-primary)', color: '#fff', borderRadius: 11, fontSize: 13, fontWeight: 700, padding: isMobile ? '9px 13px' : '10px 16px', cursor: 'pointer', flexShrink: 0 }}>
          <IconPlus size={14} />{isMobile ? 'Schedule' : 'Schedule visit'}
        </button>
      </div>
      <p style={{ margin: '6px 0 16px', fontSize: 13, color: 'rgba(27,76,94,.55)' }}>Site visits booked against a lead and a project.</p>

      <div style={{ display: 'flex', gap: 7, marginBottom: 16 }}>
        <button style={pill(scope === 'upcoming')} onClick={() => setScope('upcoming')}>Upcoming</button>
        <button style={pill(scope === 'past')} onClick={() => setScope('past')}>Past</button>
        <button style={pill(scope === 'all')} onClick={() => setScope('all')}>All</button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'rgba(27,76,94,.5)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...CARD, padding: '28px 22px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', width: 46, height: 46, borderRadius: 13, background: 'rgba(27,76,94,.07)', color: 'var(--brand-primary)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
            <IconCalendar size={22} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-primary)' }}>
            {scope === 'upcoming' ? 'No visits booked' : 'Nothing here yet'}
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.55)', marginTop: 4 }}>
            Schedule a site visit against a lead and it shows up here.
          </div>
        </div>
      ) : rows.map(v => {
        const st = STATUS_STYLE[v.status] || STATUS_STYLE.scheduled;
        const soon = v.status === 'scheduled' && relative(v.scheduled_at);
        return (
          <div key={v.id} style={{ ...CARD, padding: '14px 15px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-primary)' }}>{v.leadName}</span>
                  <TemperatureTag temp={v.leadTemperature} />
                </div>
                {v.propertyName && (
                  <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.6)', marginTop: 2 }}>
                    {v.propertyName}{v.propertyArea ? ` · ${v.propertyArea}` : ''}
                  </div>
                )}
              </div>
              <span style={{ background: st.bg, color: st.fg, fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0 }}>{st.label}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, fontSize: 12.5, color: 'var(--brand-primary)', fontWeight: 600 }}>
              <span style={{ display: 'flex', color: 'rgba(27,76,94,.45)' }}><IconCalendar size={14} /></span>
              {whenLabel(v.scheduled_at)}
              {soon && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#8A5E22', background: 'rgba(192,138,69,.16)', padding: '2px 9px', borderRadius: 999 }}>{soon}</span>}
            </div>
            {v.location && <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.6)', marginTop: 5 }}>{v.location}</div>}
            {v.notes && <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.6)', marginTop: 5, lineHeight: 1.45 }}>{v.notes}</div>}

            {v.status === 'scheduled' && (
              <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
                <button onClick={() => mark(v.id, 'done')} style={{ flex: 1, border: 'none', background: 'rgba(115,167,111,.20)', color: '#3B6B45', borderRadius: 9, fontSize: 12.5, fontWeight: 700, padding: '9px', cursor: 'pointer' }}>Mark done</button>
                <button onClick={() => mark(v.id, 'no_show')} style={{ flex: 1, border: 'none', background: 'rgba(199,80,59,.10)', color: '#9A3F2C', borderRadius: 9, fontSize: 12.5, fontWeight: 700, padding: '9px', cursor: 'pointer' }}>No show</button>
                <button onClick={() => mark(v.id, 'cancelled')} style={{ flex: 1, border: '1px solid rgba(27,76,94,.16)', background: 'transparent', color: 'rgba(27,76,94,.6)', borderRadius: 9, fontSize: 12.5, fontWeight: 700, padding: '9px', cursor: 'pointer' }}>Cancel</button>
              </div>
            )}
          </div>
        );
      })}

      {adding && <ScheduleDrawer isMobile={isMobile} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(scope); }} />}
    </div>
  );
}

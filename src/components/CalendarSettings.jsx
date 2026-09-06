import { useState, useEffect } from 'react';
import { getCalendarStatus, testCalendarConnection, setCalendarTarget } from '../liveData';

const FOREST = 'var(--brand-primary)';

// Connecting fails in two ways that look identical from the outside — the key
// is wrong, or the key is fine but nobody shared a calendar with it — so the
// test reports which, and lists what the credential can actually see.
export default function CalendarSettings() {
  const [status, setStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState('');

  const load = () => getCalendarStatus().then(setStatus);
  useEffect(() => { load(); }, []);

  async function runTest() {
    setTesting(true); setResult(null);
    const r = await testCalendarConnection();
    setResult(r);
    setTesting(false);
    load();
  }

  async function choose(calId) {
    setSaving(calId);
    try { await setCalendarTarget(calId); await load(); }
    finally { setSaving(''); }
  }

  const connected = status?.connected;

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 11,
        background: connected ? '#EAF6E4' : '#FDF3EE',
        border: `1px solid ${connected ? 'rgba(46,158,79,.28)' : 'rgba(180,84,31,.26)'}`,
        marginBottom: 14,
      }}>
        <span aria-hidden style={{ fontSize: 17 }}>{connected ? '✓' : '!'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: connected ? '#3B6B45' : '#8C4A20' }}>
            {connected ? 'Connected' : 'Not connected yet'}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(27,76,94,.6)', marginTop: 2, wordBreak: 'break-word' }}>
            {connected
              ? `Writing to ${status.calendar_id}`
              : 'Reminders are being saved, but nothing is reaching Google Calendar.'}
          </div>
        </div>
      </div>

      {status?.service_account_email && (
        <div style={{ fontSize: 12, color: 'rgba(27,76,94,.6)', marginBottom: 12, lineHeight: 1.5 }}>
          Service account:{' '}
          <code style={{ background: '#F2F6F3', padding: '2px 6px', borderRadius: 5, wordBreak: 'break-all' }}>
            {status.service_account_email}
          </code>
          <br />
          Manish must share his calendar with this address (<strong>Make changes to events</strong>) for reminders to appear.
        </div>
      )}

      {status?.last_error && (
        <div style={{ fontSize: 12, color: '#8C2F14', background: '#FCEDE9', padding: '9px 11px', borderRadius: 9, marginBottom: 12, wordBreak: 'break-word' }}>
          Last error: {status.last_error}
        </div>
      )}

      <button
        onClick={runTest}
        disabled={testing}
        style={{
          minHeight: 44, padding: '0 18px', borderRadius: 11, border: `1px solid ${FOREST}`,
          background: testing ? 'rgba(27,76,94,.08)' : '#fff', color: FOREST,
          fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: testing ? 'default' : 'pointer',
        }}
      >
        {testing ? 'Checking…' : 'Test connection'}
      </button>

      {result && !result.ok && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: '#8C2F14', background: '#FCEDE9', padding: '10px 12px', borderRadius: 10, lineHeight: 1.5, wordBreak: 'break-word' }}>
          {result.error}
        </div>
      )}

      {result?.ok && (
        <div style={{ marginTop: 14 }}>
          {!result.writable?.length ? (
            <div style={{ fontSize: 12.5, color: '#8C4A20', background: '#FDF3EE', padding: '10px 12px', borderRadius: 10, lineHeight: 1.5 }}>
              The credential works, but no calendar has been shared with it yet. In Google Calendar →
              Settings → the calendar → <strong>Share with specific people</strong>, add{' '}
              <code style={{ wordBreak: 'break-all' }}>{result.service_account}</code> with{' '}
              <strong>Make changes to events</strong>, then test again.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: 'rgba(27,76,94,.5)', marginBottom: 8, letterSpacing: '.04em' }}>
                CALENDARS IT CAN WRITE TO
              </div>
              {result.writable.map((c) => {
                const on = status?.calendar_id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => choose(c.id)}
                    disabled={saving === c.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      minHeight: 46, padding: '9px 12px', marginBottom: 7, borderRadius: 10, cursor: 'pointer',
                      border: `1px solid ${on ? FOREST : 'rgba(27,76,94,.14)'}`,
                      background: on ? 'rgba(27,76,94,.06)' : '#fff', fontFamily: 'inherit',
                    }}
                  >
                    <span aria-hidden style={{ color: on ? FOREST : 'rgba(27,76,94,.25)', fontWeight: 800 }}>
                      {on ? '●' : '○'}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: '#123642' }}>
                        {c.summary || c.id}
                      </span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'rgba(27,76,94,.5)', wordBreak: 'break-all' }}>
                        {c.id} · {c.access}
                      </span>
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

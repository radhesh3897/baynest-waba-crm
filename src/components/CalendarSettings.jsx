import { useState, useEffect } from 'react';
import { getCalendarStatus, testCalendarConnection } from '../liveData';

export default function CalendarSettings() {
  const [status, setStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { getCalendarStatus().then(setStatus); }, []);

  async function test() {
    setTesting(true); setResult(null);
    try { setResult(await testCalendarConnection()); setStatus(await getCalendarStatus()); }
    finally { setTesting(false); }
  }
  return <div>
    <div style={{ padding: 14, background: status?.connected ? '#EAF6E4' : '#FDF3EE', borderRadius: 10, marginBottom: 12 }}>
      <strong>{status === null ? 'Checking connection…' : status.connected ? 'Google Calendar connected' : 'Calendar needs attention'}</strong>
      <div style={{ marginTop: 6, overflowWrap: 'anywhere' }}>manish@baynestrealty.com</div>
      <div style={{ fontSize: 12, marginTop: 7, lineHeight: 1.6 }}>Reminders appear directly on Manish’s calendar. Add or edit them from any lead panel. Calendar alerts follow his Google Calendar notification settings.</div>
    </div>
    {status?.last_error && <p role="alert" style={{ color: '#8C2F14', overflowWrap: 'anywhere' }}>{status.last_error}</p>}
    <button onClick={test} disabled={testing} style={{ minHeight: 44, padding: '0 16px', borderRadius: 9, border: '1px solid var(--brand-primary)', background: '#fff', color: 'var(--brand-primary)', cursor: 'pointer', fontWeight: 700 }}>{testing ? 'Testing…' : 'Test calendar connection'}</button>
    {result && <p role="status" style={{ color: result.ok ? '#3B6B45' : '#8C2F14' }}>{result.ok ? 'Manish’s calendar is accessible.' : result.error || 'Connection failed.'}</p>}
  </div>;
}

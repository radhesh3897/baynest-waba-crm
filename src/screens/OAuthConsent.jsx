import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { CLIENT } from '../config/client';

export default function OAuthConsent({ session }) {
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id');
  const [details, setDetails] = useState(null);
  const [access, setAccess] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!authorizationId) {
        setError('Open the Baynest connection from Claude or ChatGPT to continue.');
        return;
      }
      const [authorization, permission] = await Promise.all([
        supabase.auth.oauth.getAuthorizationDetails(authorizationId),
        supabase.from('mcp_access').select('enabled,can_write,can_send').eq('user_id', session.user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      if (authorization.error || permission.error) {
        setError(authorization.error?.message || 'Unable to check your Baynest MCP access.');
        return;
      }
      if (!permission.data?.enabled) {
        setError('Your CRM account needs Baynest MCP access. Contact your Baynest administrator.');
        return;
      }
      // Supabase can report an existing grant as an immediate redirect. An
      // explicit click is still required before leaving this consent screen.
      setDetails(authorization.data);
      setAccess(permission.data);
    }
    load().catch(() => { if (!cancelled) setError('Unable to load this connection. Start again from Claude or ChatGPT.'); });
    return () => { cancelled = true; };
  }, [authorizationId, session.user.id]);

  async function decide(approve) {
    setBusy(true);
    setError('');
    try {
      let redirect = details?.redirect_url;
      if (!redirect) {
        const { data, error: decisionError } = approve
          ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
          : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
        if (decisionError) throw decisionError;
        redirect = data?.redirect_url;
      } else if (!approve) {
        setDetails(null);
        setAccess(null);
        setError('Connection cancelled. You can close this tab.');
        return;
      }
      if (!redirect) throw new Error('The connection did not return a callback. Please start again.');
      const target = new URL(redirect);
      if (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))) {
        throw new Error('The connection returned an unsupported callback.');
      }
      window.location.assign(target.href);
    } catch (decisionError) {
      setError(decisionError.message || 'Unable to complete this connection.');
    } finally {
      setBusy(false);
    }
  }

  const clientName = details?.client?.name || details?.client?.client_name || 'Your AI assistant';
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--app-bg)', padding: 24, fontFamily: 'var(--font-sans)' }}>
      <section style={{ maxWidth: 480, width: '100%', boxSizing: 'border-box', padding: 32, background: 'white', borderRadius: 20, color: 'var(--brand-primary)', boxShadow: '0 12px 50px #12303b12' }}>
        <img src={CLIENT.logo} alt={CLIENT.name} style={{ width: 160, maxHeight: 72, objectFit: 'contain', marginBottom: 24 }} />
        <h1 style={{ fontSize: 26, margin: '0 0 12px' }}>Connect to Baynest WABA</h1>
        {!details && !error && <p>Checking this connection…</p>}
        {details && access && <>
          <p><strong>{clientName}</strong> is requesting access to your Baynest Realty CRM as {session.user.email}.</p>
          <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
            <li>Find leads, read enquiry answers, notes, and WhatsApp conversations</li>
            <li>View pipeline counts and approved WhatsApp templates</li>
            {access.can_write && <li>Update lead details and stages, and add notes</li>}
            {access.can_send && <li>Send WhatsApp messages through Baynest’s business number</li>}
          </ul>
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>The assistant can receive CRM and customer information you ask it to access. Review its requests to change leads or send messages. You can disconnect this app in Claude or ChatGPT.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button disabled={busy} onClick={() => decide(false)} style={{ flex: 1, padding: 13, borderRadius: 10, border: '1px solid #d8e1e4', background: 'white', cursor: 'pointer' }}>Cancel</button>
            <button disabled={busy} onClick={() => decide(true)} style={{ flex: 2, padding: 13, borderRadius: 10, border: 0, background: 'var(--brand-primary)', color: 'white', cursor: 'pointer' }}>{busy ? 'Connecting…' : 'Allow connection'}</button>
          </div>
        </>}
        {error && <p role="alert" style={{ color: '#a53628', lineHeight: 1.6 }}>{error}</p>}
      </section>
    </main>
  );
}

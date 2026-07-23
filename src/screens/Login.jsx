import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { CLIENT } from '../config/client.js';

function EyeIcon({ off }) {
  return off ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68M6.06 6.06A13.2 13.2 0 0 0 2 11s3.5 7 10 7a9.12 9.12 0 0 0 3.94-.94" />
      <path d="M3 3l18 18" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message);
    // On success, the onAuthStateChange listener in App swaps the view.
  }

  const labelStyle = { display: 'block', fontSize: 11.5, fontWeight: 700, color: 'rgba(27,76,94,.6)', marginBottom: 7, letterSpacing: '.06em' };
  const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.16)', borderRadius: 11, padding: '12px 13px', fontSize: 14, color: 'var(--brand-primary)', outline: 'none', fontFamily: 'inherit', background: 'var(--brand-tint-soft)' };

  return (
    <div style={{
      minHeight: '100dvh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, boxSizing: 'border-box', fontFamily: 'var(--font-sans)',
      background: 'radial-gradient(125% 125% at 50% 0%, var(--brand-primary-light) 0%, var(--brand-primary) 40%, var(--brand-primary-dark) 100%)',
    }}>
      <div style={{ width: 'min(400px, 94vw)' }}>
        <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 20, padding: '34px 32px', boxShadow: '0 24px 60px rgba(8,30,27,.38)', border: '1px solid rgba(255,255,255,.5)' }}>

          {/* Centered logo */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <img src={CLIENT.logo} alt={CLIENT.name} style={{ height: CLIENT.logoHeight.login, width: 'auto', display: 'block' }} />
          </div>

          <h1 style={{ margin: '0 0 4px', textAlign: 'center', fontSize: 21, fontWeight: 800, color: 'var(--brand-primary)', letterSpacing: '-.01em' }}>Welcome back</h1>
          <p style={{ margin: '0 0 26px', textAlign: 'center', fontSize: 12.5, color: 'rgba(27,76,94,.55)' }}>Sign in to your WhatsApp inbox.</p>

          <label style={labelStyle}>EMAIL ADDRESS</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
            placeholder="you@email.com"
            style={{ ...inputStyle, marginBottom: 16 }}
          />

          <label style={labelStyle}>PASSWORD</label>
          <div style={{ position: 'relative', marginBottom: 22 }}>
            <input
              type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••"
              style={{ ...inputStyle, paddingRight: 46 }}
            />
            <button
              type="button" onClick={() => setShowPw(s => !s)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.5)', padding: 0 }}
            >
              <EyeIcon off={showPw} />
            </button>
          </div>

          {error && (
            <div style={{ background: '#FDE7E0', color: '#C7503B', fontSize: 12.5, fontWeight: 600, padding: '9px 12px', borderRadius: 9, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={busy}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: busy ? 'rgba(27,76,94,.65)' : 'var(--brand-primary)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 800, padding: '13px', borderRadius: 12, cursor: busy ? 'default' : 'pointer' }}
          >
            {busy ? 'Signing in…' : 'Sign in'}{!busy && <span style={{ fontSize: 16, lineHeight: 1 }}>→</span>}
          </button>

          {/* Local demo mode — opens the tool with sample data, no backend needed.
              Dev-only (import.meta.env.DEV) so it never shows on a client's live deploy. */}
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={() => { localStorage.setItem('demo_mode', '1'); location.reload(); }}
              style={{ width: '100%', marginTop: 12, background: 'transparent', color: 'var(--brand-primary)', border: '1.5px solid rgba(27,76,94,.25)', fontSize: 13.5, fontWeight: 700, padding: '11px', borderRadius: 12, cursor: 'pointer' }}
            >
              View demo
            </button>
          )}
        </form>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: 'rgba(255,255,255,.55)', fontWeight: 600, letterSpacing: '.02em' }}>
          {CLIENT.name} · {CLIENT.tagline}
        </div>
      </div>
    </div>
  );
}

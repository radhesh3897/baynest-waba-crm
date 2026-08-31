import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import { useIsMobile } from './useIsMobile';
import Home from './screens/Home';
import Inbox from './screens/Inbox';
import Automation from './screens/Automation';
import Templates from './screens/Templates';
import CRM from './screens/CRM';
import People from './screens/People';
import Properties from './screens/Properties';
import Visits from './screens/Visits';
import MetaDashboard from './screens/MetaDashboard';
import Reports from './screens/Reports';
import Campaigns from './screens/Campaigns';
import LeadsOverview from './screens/LeadsOverview';
import Stub from './screens/Stub';
import Login from './screens/Login';
import WhatsAppSettings from './screens/WhatsAppSettings';
import AccountSettings from './screens/AccountSettings';
import { supabase } from './supabaseClient';
import { IconBack } from './icons';

const STUBS = ['logs', 'help'];
// Bottom-tab roots reset the nav stack; everything else is a pushed sub-screen
// (so mobile gets a Back button to return).
const ROOT_SCREENS = ['home', 'inbox', 'automation', 'crm', 'ig-inbox', 'campaign-inbox'];

export default function App() {
  const [navStack, setNavStack] = useState(['home']);
  const screen = navStack[navStack.length - 1];
  const canGoBack = navStack.length > 1;
  const navigate = (next) => setNavStack((s) => {
    if (!next || next === s[s.length - 1]) return s;
    return ROOT_SCREENS.includes(next) ? [next] : [...s, next];
  });
  const goBack = () => setNavStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  // Opening a lead's chat from anywhere: jump to the Inbox and tell it which
  // thread to select. Held here because the Inbox and the screens that link
  // into it are siblings, and the tool replies from its own inbox rather than
  // handing the conversation off to the WhatsApp app.
  const [chatContactId, setChatContactId] = useState(null);
  const openChat = (contactId) => { setChatContactId(contactId); navigate('inbox'); };
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    let done = false;
    const ready = () => { if (!done) { done = true; setAuthReady(true); } };

    // Always resolve the gate. Without a catch, a rejected getSession() left the
    // app stuck on "Loading…" forever with no way to reach the login screen.
    supabase.auth.getSession()
      .then(({ data }) => { setSession(data?.session ?? null); })
      .catch((e) => { console.error('getSession failed', e); })
      .finally(ready);

    // Belt and braces: if the auth call hangs (offline, blocked request), fall
    // through to the login screen rather than spinning indefinitely.
    const t = setTimeout(ready, 8000);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => { clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  if (!authReady) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--app-bg)', color: 'rgba(27,76,94,.5)', fontFamily: 'var(--font-sans)', fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  if (!session) return <Login />;

  function renderMain() {
    if (screen === 'home')       return <Home onNav={navigate} onOpenChat={openChat} />;
    if (screen === 'inbox')      return <Inbox channel="whatsapp" scope="direct" openContactId={chatContactId} onOpenedContact={() => setChatContactId(null)} />;
    // Campaign replies arrive over WhatsApp too — the split is the campaign
    // stamp on the conversation, not the channel.
    if (screen === 'campaign-inbox') return <Inbox key="camp" channel="whatsapp" scope="campaign" />;
    if (screen === 'ig-inbox')   return <Inbox key="ig" channel="instagram" />;
    if (screen === 'automation') return <Automation />;
    if (screen === 'templates')  return <Templates />;
    if (screen === 'crm')        return <CRM onOpenChat={openChat} />;
    if (screen === 'people')     return <People onOpenChat={openChat} />;
    if (screen === 'properties') return <Properties />;
    if (screen === 'visits')     return <Visits />;
    if (screen === 'ads')        return <MetaDashboard />;
    // 'tracking' is intentionally locked — the nav greys it out and the route is
    // removed, so it cannot be reached even by restoring a stale nav state.
    if (screen === 'reports')    return <Reports />;
    if (screen === 'campaigns')  return <Campaigns />;
    if (screen === 'leads-overview') return <LeadsOverview />;
    if (screen === 'whatsapp')   return <WhatsAppSettings />;
    if (screen === 'account')    return <AccountSettings />;
    if (STUBS.includes(screen))  return <Stub screen={screen} />;
    return null;
  }

  const content = (
    <motion.div
      key={screen}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      {renderMain()}
    </motion.div>
  );

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100%', overflow: 'hidden', background: 'var(--app-bg)', fontFamily: 'var(--font-sans)' }}>
        {/* Safe-area (notch/status-bar) spacer + Back button on pushed sub-screens */}
        <div style={{ paddingTop: 'env(safe-area-inset-top)', background: 'var(--app-bg)', flexShrink: 0 }}>
          {canGoBack && (
            <button onClick={goBack} aria-label="Back" style={{ display: 'flex', alignItems: 'center', gap: 5, height: 44, padding: '0 12px', border: 'none', background: 'transparent', color: 'var(--brand-primary)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              <IconBack size={18} /> Back
            </button>
          )}
        </div>
        <main style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--app-bg)' }}>
          {content}
        </main>
        <BottomNav screen={screen} onNav={navigate} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', background: 'var(--app-bg)', fontFamily: 'var(--font-sans)' }}>
      <Sidebar screen={screen} onNav={navigate} />
      <main style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--app-bg)' }}>
        {content}
      </main>
    </div>
  );
}

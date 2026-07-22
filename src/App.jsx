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
import MetaDashboard from './screens/MetaDashboard';
import Tracking from './screens/Tracking';
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
const ROOT_SCREENS = ['home', 'inbox', 'automation', 'crm'];

export default function App() {
  const [navStack, setNavStack] = useState(['home']);
  const screen = navStack[navStack.length - 1];
  const canGoBack = navStack.length > 1;
  const navigate = (next) => setNavStack((s) => {
    if (!next || next === s[s.length - 1]) return s;
    return ROOT_SCREENS.includes(next) ? [next] : [...s, next];
  });
  const goBack = () => setNavStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!authReady) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EEF3F0', color: 'rgba(21,81,75,.5)', fontFamily: 'var(--font-sans)', fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  if (!session) return <Login />;

  function renderMain() {
    if (screen === 'home')       return <Home />;
    if (screen === 'inbox')      return <Inbox />;
    if (screen === 'automation') return <Automation />;
    if (screen === 'templates')  return <Templates />;
    if (screen === 'crm')        return <CRM />;
    if (screen === 'people')     return <People />;
    if (screen === 'ads')        return <MetaDashboard />;
    if (screen === 'tracking')   return <Tracking />;
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
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100%', overflow: 'hidden', background: '#EEF3F0', fontFamily: 'var(--font-sans)' }}>
        {/* Safe-area (notch/status-bar) spacer + Back button on pushed sub-screens */}
        <div style={{ paddingTop: 'env(safe-area-inset-top)', background: '#EEF3F0', flexShrink: 0 }}>
          {canGoBack && (
            <button onClick={goBack} aria-label="Back" style={{ display: 'flex', alignItems: 'center', gap: 5, height: 44, padding: '0 12px', border: 'none', background: 'transparent', color: 'var(--brand-primary)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              <IconBack size={18} /> Back
            </button>
          )}
        </div>
        <main style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#EEF3F0' }}>
          {content}
        </main>
        <BottomNav screen={screen} onNav={navigate} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', background: '#EEF3F0', fontFamily: 'var(--font-sans)' }}>
      <Sidebar screen={screen} onNav={navigate} />
      <main style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#EEF3F0' }}>
        {content}
      </main>
    </div>
  );
}

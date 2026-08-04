import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconHome, IconInbox, IconZap, IconDb, IconPeople, IconWhatsApp,
  IconTemplate, IconSettings, IconLogs, IconHelp, IconChart, IconTarget, IconSend,
} from '../icons';
import { signOut } from '../supabaseClient';
import { getUnreadCount } from '../liveData';

// Primary tabs always visible on the bar.
const MAIN = [
  { key: 'home',       label: 'Home',  Icon: IconHome },
  { key: 'inbox',      label: 'Inbox', Icon: IconInbox },
  { key: 'automation', label: 'Flows', Icon: IconZap },
  { key: 'crm',        label: 'CRM',   Icon: IconDb },
];
// Everything else lives behind the "More" sheet.
const MORE = [
  { key: 'leads-overview', label: 'Leads Overview', Icon: IconChart },
  { key: 'ads',       label: 'Ads Dashboard',    Icon: IconChart },
  { key: 'tracking',  label: 'Tracking',         Icon: IconTarget },
  { key: 'campaigns', label: 'Campaigns',        Icon: IconSend },
  { key: 'people',    label: 'People',           Icon: IconPeople },
  { key: 'whatsapp',  label: 'WhatsApp Settings', Icon: IconWhatsApp },
  { key: 'templates', label: 'Templates',        Icon: IconTemplate },
  { key: 'account',   label: 'Account settings', Icon: IconSettings },
  { key: 'logs',      label: 'Logs',             Icon: IconLogs },
  { key: 'help',      label: 'Help & support',   Icon: IconHelp },
];

function IconMore({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function Tab({ label, Icon, active, badge, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 3, border: 'none', background: 'transparent', cursor: 'pointer', padding: '7px 0 4px',
      color: active ? 'var(--brand-primary)' : 'rgba(27,76,94,.5)', position: 'relative', minWidth: 0,
    }}>
      <span style={{ position: 'relative', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? '#3B6B45' : 'currentColor' }}>
        <Icon size={22} />
        {badge > 0 && (
          <span style={{ position: 'absolute', top: -5, right: -8, background: 'var(--brand-primary)', color: '#fff', fontSize: 9.5, fontWeight: 800, minWidth: 16, height: 16, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '2px solid #fff' }}>{badge}</span>
        )}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: active ? 800 : 600, letterSpacing: '.01em' }}>{label}</span>
    </button>
  );
}

export default function BottomNav({ screen, onNav }) {
  const [unread, setUnread] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = () => getUnreadCount().then(n => { if (alive) setUnread(n); });
    refresh();
    const t = setInterval(refresh, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [screen]);

  const moreActive = MORE.some(m => m.key === screen);
  const go = key => { onNav(key); setMoreOpen(false); };

  return (
    <>
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMoreOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(14,58,53,.4)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '10px 16px calc(18px + env(safe-area-inset-bottom))', boxShadow: '0 -12px 40px rgba(14,58,53,.22)' }}>
              <div style={{ width: 40, height: 4, borderRadius: 999, background: 'rgba(27,76,94,.18)', margin: '6px auto 14px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
                {MORE.map(m => {
                  const active = m.key === screen;
                  return (
                    <button key={m.key} onClick={() => go(m.key)} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 6px',
                      border: active ? '1.5px solid var(--brand-accent-soft)' : '1px solid rgba(27,76,94,.12)', borderRadius: 14,
                      background: active ? '#EAF6E4' : '#fff', cursor: 'pointer', color: 'var(--brand-primary)',
                    }}>
                      <span style={{ width: 24, height: 24, display: 'flex', color: active ? '#3B6B45' : 'rgba(27,76,94,.7)' }}><m.Icon size={22} /></span>
                      <span style={{ fontSize: 11.5, fontWeight: active ? 800 : 600, textAlign: 'center', lineHeight: 1.2 }}>{m.label}</span>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => { signOut(); setMoreOpen(false); }} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', padding: '13px',
                border: '1px solid rgba(199,80,59,.25)', borderRadius: 12, background: '#FDECEA', color: '#C7503B',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Sign out
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav style={{
        flexShrink: 0, display: 'flex', alignItems: 'stretch', background: '#fff',
        borderTop: '1px solid rgba(27,76,94,.10)', paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -2px 12px rgba(14,58,53,.05)', zIndex: 100,
      }}>
        {MAIN.map(item => (
          <Tab key={item.key} label={item.label} Icon={item.Icon}
            active={screen === item.key}
            badge={item.key === 'inbox' ? unread : 0}
            onClick={() => go(item.key)} />
        ))}
        <Tab label="More" Icon={IconMore} active={moreActive || moreOpen} onClick={() => setMoreOpen(o => !o)} />
      </nav>
    </>
  );
}

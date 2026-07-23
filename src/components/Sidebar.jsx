import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { IconHome, IconInbox, IconZap, IconWhatsApp, IconTemplate, IconPeople, IconSettings, IconLogs, IconHelp, IconDb, IconChart, IconTarget, IconSend } from '../icons';
import { supabase } from '../supabaseClient';
import { getUnreadCount } from '../liveData';
import { CLIENT } from '../config/client.js';

const NAV_HOME = { key: 'home', label: 'Home', Icon: IconHome };
const NAV_ITEMS_WHATSAPP = [
  { key: 'inbox',      label: 'Inbox',            Icon: IconInbox },
  { key: 'templates',  label: 'Templates',        Icon: IconTemplate },
  { key: 'campaigns',  label: 'Campaigns',        Icon: IconSend },
  { key: 'automation', label: 'Automation',       Icon: IconZap },
  { key: 'whatsapp',   label: 'WhatsApp Settings', Icon: IconWhatsApp },
];
const NAV_ITEMS_LEAD_MGMT = [
  { key: 'crm',            label: 'CRM',            Icon: IconDb },
  { key: 'people',         label: 'People',         Icon: IconPeople },
  { key: 'leads-overview', label: 'Leads Overview', Icon: IconChart },
];
const NAV_ITEMS_ANALYTICS = [
  { key: 'ads', label: 'Ads Dashboard', Icon: IconChart },
  { key: 'tracking', label: 'Tracking', Icon: IconTarget },
];
const NAV_ITEMS_BOTTOM = [
  { key: 'account', label: 'Account settings', Icon: IconSettings },
  { key: 'logs',    label: 'Logs',             Icon: IconLogs },
  { key: 'help',    label: 'Help & support',   Icon: IconHelp },
];

function NavBtn({ item, active, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      animate={{ backgroundColor: active ? 'var(--brand-primary-dark)' : 'rgba(27,76,94,0)' }}
      whileHover={{ x: 3, backgroundColor: active ? 'var(--brand-primary-dark)' : 'rgba(27,76,94,.06)' }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, width: '100%',
        padding: '8px 12px', marginBottom: 2, border: 'none', cursor: 'pointer',
        borderRadius: 9, fontSize: 13.5, fontWeight: active ? 700 : 500,
        color: active ? 'var(--brand-tint-soft)' : 'rgba(27,76,94,.72)',
      }}
    >
      <span style={{ display: 'flex', width: 18, height: 18, flexShrink: 0, color: active ? 'var(--brand-accent-soft)' : 'currentColor' }}>
        <item.Icon size={18} />
      </span>
      <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
      {item.badge && (
        <span style={{ background: 'var(--brand-accent-soft)', color: 'var(--brand-primary-dark)', fontSize: 10.5, fontWeight: 800, padding: '1px 7px', borderRadius: 999 }}>
          {item.badge}
        </span>
      )}
      {item.soon && (
        <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(27,76,94,.4)', border: '1px solid rgba(27,76,94,.18)', padding: '1px 6px', borderRadius: 999 }}>soon</span>
      )}
    </motion.button>
  );
}

export default function Sidebar({ screen, onNav }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () => getUnreadCount().then(n => { if (alive) setUnread(n); });
    refresh();
    const t = setInterval(refresh, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [screen]);

  const waItems = NAV_ITEMS_WHATSAPP.map(it => it.key === 'inbox' ? { ...it, badge: unread > 0 ? String(unread) : null } : it);
  const sectionLabel = { fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: 'rgba(27,76,94,.42)', padding: '16px 12px 7px' };

  return (
    <aside style={{ width: 248, flexShrink: 0, background: '#fff', borderRight: '1px solid rgba(27,76,94,.10)', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '28px 20px 22px', display: 'flex', justifyContent: 'center' }}>
        <img src={CLIENT.logo} alt={CLIENT.name} style={{ height: 54, width: 'auto' }} />
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '6px 12px 16px' }}>
        <NavBtn item={NAV_HOME} active={screen === 'home'} onClick={() => onNav('home')} />

        <div style={sectionLabel}>WHATSAPP</div>
        {waItems.map(item => (
          <NavBtn key={item.key} item={item} active={screen === item.key} onClick={() => onNav(item.key)} />
        ))}

        <div style={sectionLabel}>LEAD MANAGEMENT</div>
        {NAV_ITEMS_LEAD_MGMT.map(item => (
          <NavBtn key={item.key} item={item} active={screen === item.key} onClick={() => onNav(item.key)} />
        ))}

        <div style={sectionLabel}>ANALYTICS</div>
        {NAV_ITEMS_ANALYTICS.map(item => (
          <NavBtn key={item.key} item={item} active={screen === item.key} onClick={() => onNav(item.key)} />
        ))}
      </nav>

      <div style={{ padding: '10px 12px 16px', borderTop: '1px solid rgba(27,76,94,.08)' }}>
        {NAV_ITEMS_BOTTOM.map(item => (
          <NavBtn key={item.key} item={item} active={screen === item.key} onClick={() => onNav(item.key)} />
        ))}
        <motion.button
          onClick={() => supabase.auth.signOut()}
          whileHover={{ x: 3, backgroundColor: 'rgba(199,80,59,.08)' }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '8px 12px', marginTop: 2, border: 'none', cursor: 'pointer', borderRadius: 9, fontSize: 13.5, fontWeight: 500, background: 'transparent', color: 'rgba(199,80,59,.85)' }}
        >
          <span style={{ display: 'flex', width: 18, height: 18, flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </span>
          <span style={{ flex: 1, textAlign: 'left' }}>Sign out</span>
        </motion.button>
      </div>
    </aside>
  );
}

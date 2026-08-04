const STUBS = {
  account:   { title: 'Account Settings',  sub: 'Workspace, team seats and channel connections.' },
  logs:      { title: 'Logs',              sub: 'Delivery, automation and webhook event logs.' },
  help:      { title: 'Help & Support',    sub: 'Docs, guides and a way to reach the team.' },
  whatsapp:  { title: 'WhatsApp Channel', sub: 'Connected number, quality rating and broadcasts.' },
};

export default function Stub({ screen }) {
  const s = STUBS[screen] || { title: screen, sub: '' };
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--brand-primary)' }}>{s.title}</h2>
        <p style={{ margin: '10px 0 0', fontSize: 14, color: 'rgba(27,76,94,.55)' }}>{s.sub}</p>
      </div>
    </div>
  );
}

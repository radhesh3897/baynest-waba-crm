import { IconMail, IconSms, IconRcs } from '../icons';

const ICON_MAP = { email: IconMail, sms: IconSms, rcs: IconRcs };
const TITLE_MAP = { email: 'Email', sms: 'SMS', rcs: 'RCS' };

export default function ComingSoon({ screen }) {
  const Icon = ICON_MAP[screen] || IconMail;
  const title = TITLE_MAP[screen] || screen;
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#fff', border: '1px solid rgba(21,81,75,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <span style={{ width: 34, height: 34, display: 'flex', color: 'var(--brand-primary)' }}><Icon size={34} /></span>
        </div>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--brand-primary)' }}>{title}</h2>
        <p style={{ margin: '10px 0 0', fontSize: 14.5, lineHeight: 1.55, color: 'rgba(21,81,75,.6)' }}>
          This channel isn't wired up yet. {title} campaigns and inbox routing are on the roadmap — for now everything runs through WhatsApp.
        </p>
        <button style={{ marginTop: 22, background: '#73CF6F', color: 'var(--brand-primary)', border: 'none', fontSize: 13.5, fontWeight: 800, padding: '11px 22px', borderRadius: 10, cursor: 'pointer' }}>
          Notify me when ready
        </button>
      </div>
    </div>
  );
}

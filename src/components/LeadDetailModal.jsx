import { useState, useEffect } from 'react';
import { IconX, IconWhatsApp, IconEdit } from '../icons';
import { getContactLive } from '../liveData';
import ContactNotes from './ContactNotes';
import LeadCustomFields from './LeadCustomFields';
import LeadAnswersEditable from './LeadAnswersEditable';
import LeadProperties from './LeadProperties';
import TemperatureTag from './TemperatureTag';
import PipelineMover from './PipelineMover';

// The lead detail pop-up, shared by every screen that shows a lead name.
//
// Takes either a full `contact` (the CRM board already has one in memory) or a
// bare `contactId` and loads it (the dashboard's Recent Leads only holds an id).
// Same panel either way, so a lead opened from Home behaves exactly like one
// opened from the board.
export default function LeadDetailModal({ contact: given, contactId, onClose, onUpdate, onOpenChat }) {
  const [fetched, setFetched] = useState(null);
  const [loading, setLoading] = useState(!given);

  const id = given?.id || contactId;

  useEffect(() => {
    let alive = true;
    if (given || !contactId) { setLoading(false); return; }
    setLoading(true);
    getContactLive(contactId).then(c => {
      if (!alive) return;
      setFetched(c);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [given, contactId]);

  // Close on Escape, like every other overlay in the app.
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const contact = given || fetched;

  // Local echo so edits made in here show immediately even when the parent has
  // nowhere to store them (the dashboard has no lead list to patch).
  const [patch, setPatch] = useState({});
  useEffect(() => { setPatch({}); }, [id]);
  const view = contact ? { ...contact, ...patch } : null;

  function applyUpdate(cid, p) {
    setPatch(prev => ({ ...prev, ...p }));
    onUpdate?.(cid, p);
  }

  const shell = (children) => (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(14,58,53,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="fade-up" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(480px,96vw)', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(14,58,53,.3)' }}>
        <div style={{ padding: '16px 20px 0', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#F2F6F3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.55)' }}>
            <IconX size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );

  if (loading) {
    return shell(
      <div style={{ padding: '30px 20px 46px', textAlign: 'center', fontSize: 13.5, color: 'rgba(27,76,94,.5)' }}>Loading lead…</div>
    );
  }
  if (!view) {
    return shell(
      <div style={{ padding: '30px 20px 46px', textAlign: 'center', fontSize: 13.5, color: 'rgba(27,76,94,.55)' }}>
        This lead could not be loaded. It may have been deleted.
      </div>
    );
  }

  return shell(
    <>
      <div style={{ padding: '4px 20px 18px', textAlign: 'center', borderBottom: '1px solid rgba(27,76,94,.08)' }}>
        {/* Name and tag travel together, here as everywhere else. This is the
            one place the tag is editable — Manish has the lead open and can
            see the answers the automatic call was made from. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--brand-primary)' }}>{view.profile_name}</span>
          <TemperatureTag
            temp={view.temperature} override={view.temperature_override}
            contactId={view.id} editable size="md"
            onChange={(t, o) => applyUpdate(view.id, { temperature: t, temperature_override: o })}
          />
        </div>
        <div style={{ fontSize: 12, color: 'rgba(27,76,94,.55)', marginTop: 2 }}>{view.jobTitle !== '-' ? `${view.jobTitle} · ` : ''}{view.company !== '-' ? view.company : ''}</div>
        {view.phone && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 13 }}>
            {/* A thread we already hold opens in our own Inbox — that is where
                the team replies, and where the history and templates live.
                Roughly half of all leads have never messaged us, though, and
                there is no thread to open for them: those get WhatsApp itself,
                which is the only way to start the conversation. */}
            {onOpenChat && view.wa_conversation_id ? (
              <button type="button" title="Open this chat in the Inbox"
                onClick={() => { onOpenChat(view.id); onClose?.(); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 16px', borderRadius: 12, border: '1px solid rgba(46,158,79,.3)', background: '#EAF6E4', color: '#3B6B45', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <IconWhatsApp size={19} /> Open chat
              </button>
            ) : (
              <a href={`https://wa.me/${String(view.phone || '').replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer"
                title="No chat in the inbox yet — this opens WhatsApp to start one"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 16px', borderRadius: 12, border: '1px solid rgba(27,76,94,.18)', background: '#fff', color: 'rgba(27,76,94,.7)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                <IconWhatsApp size={19} /> Start on WhatsApp
              </a>
            )}
          </div>
        )}
      </div>

      {/* Move between boards. First thing under the header because on a phone
          this is the reason Manish opened the lead at all. */}
      <div style={{ padding: '16px 20px 4px' }}>
        <PipelineMover
          contactId={view.id}
          stage={view.lead_status}
          dealValue={view.deal_value_cr}
          dealValueIsManual={view.deal_value_is_manual}
          onMoved={(s, p) => applyUpdate(view.id, { lead_status: s, pipeline: p })}
          onValueChange={(v, m) => applyUpdate(view.id, { deal_value_cr: v, deal_value_is_manual: m })}
        />
      </div>

      <div style={{ padding: '16px 20px 6px', borderTop: '1px solid rgba(27,76,94,.08)', marginTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: 'var(--brand-primary)', marginBottom: 10 }}>CONTACT DETAILS</div>
        {[
          { label: 'Phone',  value: view.phone },
          { label: 'Email',  value: view.email },
          { label: 'Source', value: view.source },
        ].map(f => <FieldRow key={f.label} label={f.label} value={f.value} />)}
      </div>

      <div style={{ padding: '8px 20px 24px' }}>
        <LeadAnswersEditable contactId={view.id} attributes={view.attributes} />
        {/* Which projects they are chasing — this is what sets the deal value
            above, so it belongs on the same screen as it. */}
        <div style={{ borderTop: '1px solid rgba(27,76,94,.08)', paddingTop: 16, marginTop: 4 }}>
          <LeadProperties contactId={view.id} lead={view} />
        </div>
        {/* Same tags and custom fields the Inbox panel edits, so whatever the
            team captures mid-chat is here when the lead is opened elsewhere. */}
        <div style={{ borderTop: '1px solid rgba(27,76,94,.08)', paddingTop: 16, marginTop: 16 }}>
          <LeadCustomFields contactId={view.id} />
        </div>
        <div style={{ borderTop: '1px solid rgba(27,76,94,.08)', paddingTop: 16, marginTop: 16 }}>
          <ContactNotes contactId={view.id} />
        </div>
      </div>
    </>
  );
}

function FieldRow({ label, value }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(27,76,94,.45)', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(27,76,94,.13)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, color: 'var(--brand-primary)', fontWeight: 500 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '-'}</span>
        <span style={{ color: 'rgba(27,76,94,.3)', flexShrink: 0, marginLeft: 6, display: 'flex' }}><IconEdit size={12} /></span>
      </div>
    </div>
  );
}

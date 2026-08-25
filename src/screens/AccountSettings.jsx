import { useState, useEffect } from 'react';
import {
  getStageConfig, savePipelineStages, saveDealStages, getTeamLive, addTeamMember, removeTeamMember,
  getSettings, getTemplatesLive, getFlowList,
} from '../liveData';
import { useIsMobile } from '../useIsMobile';
import { IconPlus, IconX, IconWhatsApp, IconDb, IconMail, IconZap, IconTemplate, IconPeople } from '../icons';
import { enablePush, disablePush, pushStatus, pushSupported } from '../push';

const CARD = { background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 16, padding: 22, marginBottom: 18 };
const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.18)', borderRadius: 9, padding: '10px 12px', fontSize: 13, color: 'var(--brand-primary)', outline: 'none', fontFamily: 'inherit', background: '#fff' };
const labelStyle = { fontSize: 11.5, fontWeight: 700, color: 'rgba(27,76,94,.6)', display: 'block', marginBottom: 6, letterSpacing: '.03em' };

function SectionHead({ Icon, title, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 18 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EAF6E4', color: '#3B6B45', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, flexShrink: 0 }}><Icon size={20} /></div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-primary)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'rgba(27,76,94,.55)' }}>{sub}</div>
      </div>
    </div>
  );
}

function ConnRow({ Icon, label, value, ok }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid rgba(27,76,94,.06)' }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: '#F2F8F2', color: 'var(--brand-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 7, flexShrink: 0 }}><Icon size={16} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)' }}>{label}</div>
        <div style={{ fontSize: 11.5, color: 'rgba(27,76,94,.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: ok ? '#3B6B45' : '#B6743A', background: ok ? '#EAF6E4' : '#FFF1DC', padding: '4px 11px', borderRadius: 999, flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? '#3B6B45' : '#D9A93B' }} />{ok ? 'Connected' : 'Setup needed'}
      </span>
    </div>
  );
}

export default function AccountSettings() {
  const isMobile = useIsMobile();
  const [stages, setStages] = useState([]);
  const [dealStages, setDealStages] = useState([]);
  const [savingStages, setSavingStages] = useState(false);
  const [stageMsg, setStageMsg] = useState('');
  const [team, setTeam] = useState([]);
  const [member, setMember] = useState({ name: '', email: '', role: 'Member' });
  const [addingMember, setAddingMember] = useState(false);
  const [conn, setConn] = useState(null);
  const [push, setPush] = useState('default');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState('');

  async function togglePush() {
    setPushMsg(''); setPushBusy(true);
    try {
      if (push === 'enabled') { await disablePush(); setPush('default'); setPushMsg('Notifications turned off on this device.'); }
      else { await enablePush(); setPush('enabled'); setPushMsg('✅ Notifications enabled on this device. You’ll get a push for every new lead.'); }
    } catch (e) { setPushMsg(e.message || 'Could not enable notifications.'); }
    setPushBusy(false);
  }

  useEffect(() => {
    getStageConfig().then(c => { setStages(c.lead); setDealStages(c.deal); });
    getTeamLive().then(setTeam);
    pushStatus().then(setPush);
    (async () => {
      const [s, tpls, flows] = await Promise.all([getSettings(), getTemplatesLive(), getFlowList()]);
      setConn({
        number: s?.business_number || '',
        emails: s?.notify_emails || '',
        approved: (tpls || []).filter(t => t.status === 'Approved').length,
        activeFlows: (flows || []).filter(f => f.status === 'active').length,
      });
    })();
  }, []);

  // Both boards edit the same way, so the handlers take the setter rather than
  // being written out twice.
  const editors = (set) => ({
    setStage: (i, v) => set(st => st.map((s, idx) => idx === i ? v : s)),
    removeStage: (i) => set(st => st.filter((_, idx) => idx !== i)),
    addStage: () => set(st => [...st, '']),
    moveStage: (i, dir) => set(st => {
      const j = i + dir;
      if (j < 0 || j >= st.length) return st;
      const next = [...st];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    }),
  });
  const leadEd = editors(setStages);
  const dealEd = editors(setDealStages);

  async function saveStages() {
    setSavingStages(true); setStageMsg('');
    const lead = stages.map(s => s.trim()).filter(Boolean);
    const deal = dealStages.map(s => s.trim()).filter(Boolean);
    // A name in both lists would make the pipeline a contact belongs to
    // ambiguous, and the DB derives the board from the stage name.
    const clash = lead.filter(s => deal.includes(s));
    if (clash.length) {
      setSavingStages(false);
      setStageMsg(`"${clash[0]}" is in both boards. Stage names must be unique across the two.`);
      setTimeout(() => setStageMsg(''), 4000);
      return;
    }
    const [a, b] = await Promise.all([savePipelineStages(lead), saveDealStages(deal)]);
    setSavingStages(false);
    if (a.ok && b.ok) { setStageMsg('Pipelines saved.'); setStages(lead); setDealStages(deal); }
    else setStageMsg(a.error || b.error || 'Could not save.');
    setTimeout(() => setStageMsg(''), 2500);
  }

  async function handleAddMember() {
    setAddingMember(true);
    const res = await addTeamMember(member);
    setAddingMember(false);
    if (res.ok) { setTeam(t => [...t, res.member]); setMember({ name: '', email: '', role: 'Member' }); }
  }
  async function handleRemoveMember(id) {
    setTeam(t => t.filter(m => m.id !== id));
    await removeTeamMember(id);
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <header style={{ padding: isMobile ? '18px 16px 14px' : '22px 30px 18px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: 'rgba(27,76,94,.45)' }}>WORKSPACE</div>
        <h1 style={{ margin: '5px 0 0', fontSize: 23, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--brand-primary)' }}>Account Settings</h1>
      </header>

      <div style={{ padding: isMobile ? '6px 16px 28px' : '6px 30px 40px', maxWidth: 760 }}>

        {/* ── CRM SETTINGS: both pipeline editors ── */}
        <div style={CARD}>
          <SectionHead Icon={IconDb} title="CRM pipelines" sub="Two boards: leads before the call, deals after it. A contact sits on whichever board its stage belongs to." />

          {[
            { key: 'lead', title: 'Lead pipeline', blurb: 'Before the call. No money attached yet.', list: stages, ed: leadEd },
            { key: 'deal', title: 'Deal pipeline', blurb: 'After the call. Every contact here carries a deal value.', list: dealStages, ed: dealEd },
          ].map(board => (
            <div key={board.key} style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--brand-primary)' }}>{board.title}</div>
              <div style={{ fontSize: 11.5, color: 'rgba(27,76,94,.5)', margin: '2px 0 10px' }}>{board.blurb}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {board.list.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(27,76,94,.4)', width: 18, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                    <input value={s} onChange={e => board.ed.setStage(i, e.target.value)} placeholder="Stage name" style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={() => board.ed.moveStage(i, -1)} disabled={i === 0} title="Move up" style={{ ...arrowBtn, opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                    <button onClick={() => board.ed.moveStage(i, 1)} disabled={i === board.list.length - 1} title="Move down" style={{ ...arrowBtn, opacity: i === board.list.length - 1 ? 0.35 : 1 }}>↓</button>
                    <button onClick={() => board.ed.removeStage(i)} title="Remove stage" style={{ width: 38, height: 38, flexShrink: 0, border: 'none', background: '#FDECEA', borderRadius: 8, cursor: 'pointer', color: '#C7503B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconX size={14} /></button>
                  </div>
                ))}
              </div>
              <button onClick={board.ed.addStage} style={{ marginTop: 10, border: '1px dashed rgba(27,76,94,.3)', background: '#fff', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--brand-primary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconPlus size={14} /> Add stage</button>
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            <button onClick={saveStages} disabled={savingStages} style={{ background: 'var(--brand-accent-soft)', border: 'none', color: 'var(--brand-primary-dark)', fontSize: 13, fontWeight: 800, padding: '10px 18px', borderRadius: 10, cursor: savingStages ? 'default' : 'pointer', opacity: savingStages ? 0.6 : 1 }}>{savingStages ? 'Saving…' : 'Save pipelines'}</button>
            {stageMsg && <span style={{ fontSize: 12.5, fontWeight: 600, color: stageMsg.includes('saved') ? '#3B6B45' : '#C7503B' }}>{stageMsg}</span>}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(27,76,94,.45)', marginTop: 10, lineHeight: 1.5 }}>
            A stage name decides which board a contact appears on, so the same name cannot be used in both lists. Renaming a stage won't move leads already in the old one — keep existing names if you have active leads, or re-drag them after.
          </div>
        </div>

        {/* ── TEAM ── */}
        <div style={CARD}>
          <SectionHead Icon={IconPeople} title="Team" sub="People in your workspace." />
          {team.length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.5)', marginBottom: 12 }}>No team members added yet.</div>}
          {team.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid rgba(27,76,94,.06)' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--brand-muted)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{(m.name || m.email || '?').charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)' }}>{m.name || '-'}</div>
                <div style={{ fontSize: 11.5, color: 'rgba(27,76,94,.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email || ''}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-primary)', background: 'rgba(27,76,94,.07)', padding: '3px 10px', borderRadius: 999 }}>{m.role || 'Member'}</span>
              <button onClick={() => handleRemoveMember(m.id)} title="Remove" style={{ width: 38, height: 38, border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(199,80,59,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconX size={14} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <input value={member.name} onChange={e => setMember({ ...member, name: e.target.value })} placeholder="Name" style={{ ...inputStyle, flex: '1 1 140px' }} />
            <input value={member.email} onChange={e => setMember({ ...member, email: e.target.value })} placeholder="Email" style={{ ...inputStyle, flex: '1 1 160px' }} />
            <select value={member.role} onChange={e => setMember({ ...member, role: e.target.value })} style={{ ...inputStyle, width: 120, cursor: 'pointer', flex: '0 0 auto' }}>
              {['Owner', 'Admin', 'Member', 'Agent'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={handleAddMember} disabled={addingMember} style={{ background: 'var(--brand-primary)', border: 'none', color: '#EAF6E4', fontSize: 13, fontWeight: 700, padding: '10px 16px', borderRadius: 10, cursor: addingMember ? 'default' : 'pointer', flex: '0 0 auto' }}>{addingMember ? 'Adding…' : 'Add'}</button>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(27,76,94,.45)', marginTop: 10, lineHeight: 1.5 }}>This is your team directory. To give someone a login, also create their user in Supabase → Authentication.</div>
        </div>

        {/* ── CONNECTIONS ── */}
        <div style={CARD}>
          <SectionHead Icon={IconZap} title="Connections" sub="What's wired up in this workspace." />
          {!conn ? <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.5)' }}>Loading…</div> : (
            <div>
              <ConnRow Icon={IconWhatsApp} label="WhatsApp number" value={conn.number || 'Not set'} ok={!!conn.number} />
              <ConnRow Icon={IconZap} label="Lead intake (Meta → n8n)" value="Auto-capturing new leads" ok={true} />
              <ConnRow Icon={IconTemplate} label="Templates" value={`${conn.approved} approved`} ok={conn.approved > 0} />
              <ConnRow Icon={IconZap} label="Automations" value={`${conn.activeFlows} active flow${conn.activeFlows === 1 ? '' : 's'}`} ok={conn.activeFlows > 0} />
              <ConnRow Icon={IconMail} label="Email alerts" value={conn.emails ? conn.emails : 'No recipients set'} ok={!!conn.emails} />
              <ConnRow Icon={IconDb} label="Database" value="Supabase · live" ok={true} />
            </div>
          )}
        </div>

        {/* ── NOTIFICATIONS ── */}
        <div style={CARD}>
          <SectionHead Icon={IconMail} title="Phone notifications" sub="Get a push on this device when a new Meta lead arrives." />
          {push === 'unsupported' ? (
            <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.55)', lineHeight: 1.55 }}>
              This browser can’t do push. <b>On iPhone:</b> add this app to your Home Screen first (Safari → Share → Add to Home Screen), then open it from the icon and enable here. Works directly in Chrome on Android/desktop.
            </div>
          ) : push === 'denied' ? (
            <div style={{ fontSize: 12.5, color: '#B6743A', lineHeight: 1.55 }}>
              Notifications are blocked for this site. Enable them in your browser/site settings, then reload.
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={togglePush} disabled={pushBusy} style={{
                background: push === 'enabled' ? '#fff' : 'var(--brand-accent-soft)',
                color: push === 'enabled' ? '#C7503B' : 'var(--brand-primary-dark)',
                border: push === 'enabled' ? '1px solid rgba(199,80,59,.3)' : 'none',
                fontSize: 13.5, fontWeight: 800, padding: '11px 18px', borderRadius: 10, cursor: pushBusy ? 'default' : 'pointer', opacity: pushBusy ? 0.7 : 1,
              }}>
                {pushBusy ? 'Working…' : push === 'enabled' ? 'Turn off notifications' : 'Enable notifications'}
              </button>
              <span style={{ fontSize: 12, fontWeight: 700, color: push === 'enabled' ? '#3B6B45' : 'rgba(27,76,94,.5)' }}>
                {push === 'enabled' ? '● On for this device' : '○ Off'}
              </span>
            </div>
          )}
          {pushMsg && <div style={{ fontSize: 12, color: 'rgba(27,76,94,.7)', marginTop: 10, lineHeight: 1.5 }}>{pushMsg}</div>}
        </div>

      </div>
    </div>
  );
}

const arrowBtn = { width: 38, height: 38, flexShrink: 0, border: '1px solid rgba(27,76,94,.16)', background: '#fff', borderRadius: 8, cursor: 'pointer', color: 'var(--brand-primary)', fontSize: 14, fontWeight: 700 };

import { useState, useEffect } from 'react';
import {
  getPipelineStages, savePipelineStages, getTeamLive, addTeamMember, removeTeamMember,
  getSettings, getTemplatesLive, getFlowList,
} from '../liveData';
import { useIsMobile } from '../useIsMobile';
import { IconPlus, IconX, IconWhatsApp, IconDb, IconMail, IconZap, IconTemplate, IconPeople } from '../icons';
import { enablePush, disablePush, pushStatus, pushSupported } from '../push';

const CARD = { background: '#fff', border: '1px solid rgba(21,81,75,.10)', borderRadius: 16, padding: 22, marginBottom: 18 };
const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(21,81,75,.18)', borderRadius: 9, padding: '10px 12px', fontSize: 13, color: 'var(--brand-primary)', outline: 'none', fontFamily: 'inherit', background: '#fff' };
const labelStyle = { fontSize: 11.5, fontWeight: 700, color: 'rgba(21,81,75,.6)', display: 'block', marginBottom: 6, letterSpacing: '.03em' };

function SectionHead({ Icon, title, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 18 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EAF6E4', color: '#2E9E4F', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, flexShrink: 0 }}><Icon size={20} /></div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-primary)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'rgba(21,81,75,.55)' }}>{sub}</div>
      </div>
    </div>
  );
}

function ConnRow({ Icon, label, value, ok }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid rgba(21,81,75,.06)' }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: '#F2F8F2', color: '#356E63', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 7, flexShrink: 0 }}><Icon size={16} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)' }}>{label}</div>
        <div style={{ fontSize: 11.5, color: 'rgba(21,81,75,.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: ok ? '#2E9E4F' : '#B6743A', background: ok ? '#EAF6E4' : '#FFF1DC', padding: '4px 11px', borderRadius: 999, flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? '#2E9E4F' : '#D9A93B' }} />{ok ? 'Connected' : 'Setup needed'}
      </span>
    </div>
  );
}

export default function AccountSettings() {
  const isMobile = useIsMobile();
  const [stages, setStages] = useState([]);
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
    getPipelineStages().then(setStages);
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

  function setStage(i, v) { setStages(st => st.map((s, idx) => idx === i ? v : s)); }
  function removeStage(i) { setStages(st => st.filter((_, idx) => idx !== i)); }
  function addStage() { setStages(st => [...st, '']); }
  function moveStage(i, dir) {
    setStages(st => {
      const j = i + dir;
      if (j < 0 || j >= st.length) return st;
      const next = [...st];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  async function saveStages() {
    setSavingStages(true); setStageMsg('');
    const res = await savePipelineStages(stages);
    setSavingStages(false);
    if (res.ok) { setStageMsg('Pipeline saved.'); setStages(stages.map(s => s.trim()).filter(Boolean)); }
    else setStageMsg(res.error || 'Could not save.');
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
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: 'rgba(21,81,75,.45)' }}>WORKSPACE</div>
        <h1 style={{ margin: '5px 0 0', fontSize: 23, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--brand-primary)' }}>Account Settings</h1>
      </header>

      <div style={{ padding: isMobile ? '6px 16px 28px' : '6px 30px 40px', maxWidth: 760 }}>

        {/* ── CRM SETTINGS: pipeline editor ── */}
        <div style={CARD}>
          <SectionHead Icon={IconDb} title="CRM pipeline" sub="The lead stages shown as columns in your CRM Kanban." />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stages.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(21,81,75,.4)', width: 18, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                <input value={s} onChange={e => setStage(i, e.target.value)} placeholder="Stage name" style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => moveStage(i, -1)} disabled={i === 0} title="Move up" style={{ ...arrowBtn, opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                <button onClick={() => moveStage(i, 1)} disabled={i === stages.length - 1} title="Move down" style={{ ...arrowBtn, opacity: i === stages.length - 1 ? 0.35 : 1 }}>↓</button>
                <button onClick={() => removeStage(i)} title="Remove stage" style={{ width: 34, height: 34, flexShrink: 0, border: 'none', background: '#FDECEA', borderRadius: 8, cursor: 'pointer', color: '#C7503B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconX size={14} /></button>
              </div>
            ))}
          </div>
          <button onClick={addStage} style={{ marginTop: 10, border: '1px dashed rgba(21,81,75,.3)', background: '#fff', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--brand-primary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconPlus size={14} /> Add stage</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <button onClick={saveStages} disabled={savingStages} style={{ background: '#73CF6F', border: 'none', color: 'var(--brand-primary-dark)', fontSize: 13, fontWeight: 800, padding: '10px 18px', borderRadius: 10, cursor: savingStages ? 'default' : 'pointer', opacity: savingStages ? 0.6 : 1 }}>{savingStages ? 'Saving…' : 'Save pipeline'}</button>
            {stageMsg && <span style={{ fontSize: 12.5, fontWeight: 600, color: stageMsg.includes('saved') ? '#2E9E4F' : '#C7503B' }}>{stageMsg}</span>}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(21,81,75,.45)', marginTop: 10, lineHeight: 1.5 }}>Renaming a stage won't move leads already in the old one — keep existing names if you have active leads, or re-drag them after.</div>
        </div>

        {/* ── TEAM ── */}
        <div style={CARD}>
          <SectionHead Icon={IconPeople} title="Team" sub="People in your workspace." />
          {team.length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(21,81,75,.5)', marginBottom: 12 }}>No team members added yet.</div>}
          {team.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid rgba(21,81,75,.06)' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#356E63', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{(m.name || m.email || '?').charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)' }}>{m.name || '—'}</div>
                <div style={{ fontSize: 11.5, color: 'rgba(21,81,75,.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email || ''}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-primary)', background: 'rgba(21,81,75,.07)', padding: '3px 10px', borderRadius: 999 }}>{m.role || 'Member'}</span>
              <button onClick={() => handleRemoveMember(m.id)} title="Remove" style={{ width: 30, height: 30, border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(199,80,59,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconX size={14} /></button>
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
          <div style={{ fontSize: 11, color: 'rgba(21,81,75,.45)', marginTop: 10, lineHeight: 1.5 }}>This is your team directory. To give someone a login, also create their user in Supabase → Authentication.</div>
        </div>

        {/* ── CONNECTIONS ── */}
        <div style={CARD}>
          <SectionHead Icon={IconZap} title="Connections" sub="What's wired up in this workspace." />
          {!conn ? <div style={{ fontSize: 12.5, color: 'rgba(21,81,75,.5)' }}>Loading…</div> : (
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
            <div style={{ fontSize: 12.5, color: 'rgba(21,81,75,.55)', lineHeight: 1.55 }}>
              This browser can’t do push. <b>On iPhone:</b> add this app to your Home Screen first (Safari → Share → Add to Home Screen), then open it from the icon and enable here. Works directly in Chrome on Android/desktop.
            </div>
          ) : push === 'denied' ? (
            <div style={{ fontSize: 12.5, color: '#B6743A', lineHeight: 1.55 }}>
              Notifications are blocked for this site. Enable them in your browser/site settings, then reload.
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={togglePush} disabled={pushBusy} style={{
                background: push === 'enabled' ? '#fff' : '#73CF6F',
                color: push === 'enabled' ? '#C7503B' : 'var(--brand-primary-dark)',
                border: push === 'enabled' ? '1px solid rgba(199,80,59,.3)' : 'none',
                fontSize: 13.5, fontWeight: 800, padding: '11px 18px', borderRadius: 10, cursor: pushBusy ? 'default' : 'pointer', opacity: pushBusy ? 0.7 : 1,
              }}>
                {pushBusy ? 'Working…' : push === 'enabled' ? 'Turn off notifications' : 'Enable notifications'}
              </button>
              <span style={{ fontSize: 12, fontWeight: 700, color: push === 'enabled' ? '#2E9E4F' : 'rgba(21,81,75,.5)' }}>
                {push === 'enabled' ? '● On for this device' : '○ Off'}
              </span>
            </div>
          )}
          {pushMsg && <div style={{ fontSize: 12, color: 'rgba(21,81,75,.7)', marginTop: 10, lineHeight: 1.5 }}>{pushMsg}</div>}
        </div>

      </div>
    </div>
  );
}

const arrowBtn = { width: 30, height: 34, flexShrink: 0, border: '1px solid rgba(21,81,75,.16)', background: '#fff', borderRadius: 8, cursor: 'pointer', color: 'var(--brand-primary)', fontSize: 14, fontWeight: 700 };

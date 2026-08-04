import { useEffect } from 'react';
import { Handle, Position, useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import { getCachedTemplates as getFlowTemplates, getCachedTemplateButtons as getTemplateButtons } from '../liveData';
import { IconWhatsApp, IconClock, IconBranch, IconPeople, IconFlow, IconInbox, IconFacebook, IconTemplate, IconDb } from '../icons';

const FOREST = 'var(--brand-primary)';
const LIME = 'var(--brand-accent-soft)';

const handleStyle = { width: 11, height: 11, background: '#fff', border: `2px solid ${LIME}` };
const targetStyle = { ...handleStyle, border: '2px solid #9CB7B0' };

function Shell({ icon: Icon, title, tint, headerDark, children, width = 232 }) {
  return (
    <div style={{ width, background: '#fff', borderRadius: 13, border: '1px solid rgba(27,76,94,.16)', boxShadow: '0 4px 14px rgba(14,58,53,.10)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', background: headerDark ? `linear-gradient(90deg, ${FOREST}, var(--brand-muted))` : '#F4F9F3', borderBottom: headerDark ? 'none' : '1px solid rgba(27,76,94,.08)' }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 5, background: headerDark ? 'rgba(255,255,255,.16)' : (tint || '#EAF6E4'), color: headerDark ? 'var(--brand-accent-pale)' : '#3B6B45' }}>
          <Icon size={16} />
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: headerDark ? '#EAF6E4' : FOREST }}>{title}</span>
      </div>
      <div style={{ padding: '11px 12px 13px' }}>{children}</div>
    </div>
  );
}

const selectStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.18)', borderRadius: 8, padding: '7px 9px', fontSize: 12, fontWeight: 600, color: FOREST, fontFamily: 'inherit', background: '#fff' };
const labelStyle = { fontSize: 10, fontWeight: 700, letterSpacing: '.04em', color: 'rgba(27,76,94,.5)', marginBottom: 5, display: 'block' };

const TRIGGER_LABELS = { new_lead: 'New Lead (FB form)', inbound: 'Inbound Message', keyword: 'Keyword', manual: 'Manual' };
const TRIGGER_ICONS  = { new_lead: IconFacebook, inbound: IconInbox, keyword: IconBranch, manual: IconFlow };

export function TriggerNode({ data }) {
  const Icon = TRIGGER_ICONS[data.trigger] || IconFlow;
  return (
    <Shell icon={Icon} title="Trigger" headerDark>
      <div style={{ fontSize: 13, fontWeight: 800, color: FOREST }}>{TRIGGER_LABELS[data.trigger] || data.trigger}</div>
      <div style={{ fontSize: 11, color: 'rgba(27,76,94,.55)', marginTop: 3 }}>Flow starts here</div>
      {data.trigger === 'keyword' && <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(27,76,94,.6)' }}>Keyword: <strong>{data.keyword || '—'}</strong></div>}
      <Handle type="source" position={Position.Right} id="out" style={handleStyle} />
    </Shell>
  );
}

const VAR_FIELDS = [
  { key: 'profile_name', label: 'Name' },
  { key: 'first_name', label: 'First name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company' },
  { key: 'city', label: 'City' },
];

export function SendTemplateNode({ id, data }) {
  const { updateNodeData } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const templates = getFlowTemplates();
  const buttons = getTemplateButtons(data.templateName);

  // When the chosen template changes the number of buttons, re-measure handles.
  useEffect(() => { updateNodeInternals(id); }, [data.templateName, buttons.length, id, updateNodeInternals]);

  const tpl = templates.find(t => t.name === data.templateName);
  const bodyVars = tpl ? [...new Set((String(tpl.body || '').match(/\{\{(\d+)\}\}/g) || []).map(m => m.replace(/[^\d]/g, '')))].sort((a, b) => a - b) : [];
  const vars = data.variables || {};
  const setVar = (n, field) => updateNodeData(id, { variables: { ...vars, [n]: field } });

  return (
    <Shell icon={IconWhatsApp} title="Send Template">
      <Handle type="target" position={Position.Left} id="in" style={targetStyle} />
      <span style={labelStyle}>TEMPLATE</span>
      <select className="nodrag" value={data.templateName || ''} onChange={e => updateNodeData(id, { templateName: e.target.value })} style={selectStyle}>
        <option value="">Choose…</option>
        {templates.map(t => <option key={t.name} value={t.name}>{t.name}{t.buttons.length ? ` (${t.buttons.length} buttons)` : ''}</option>)}
      </select>

      {tpl && <div style={{ marginTop: 9, fontSize: 11, lineHeight: 1.45, color: 'rgba(27,76,94,.7)', background: '#F4F9F3', borderRadius: 8, padding: '8px 9px' }}>{tpl.body}</div>}

      {bodyVars.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <span style={labelStyle}>FILL VARIABLES FROM CONTACT</span>
          {bodyVars.map(n => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--brand-primary)', minWidth: 34 }}>{`{{${n}}}`}</span>
              <select className="nodrag" value={vars[n] || ''} onChange={e => setVar(n, e.target.value)} style={{ ...selectStyle, marginBottom: 0, flex: 1 }}>
                <option value="">Pick attribute…</option>
                {VAR_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {buttons.length === 0 ? (
        <Handle type="source" position={Position.Right} id="out" style={handleStyle} />
      ) : (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {buttons.map((b, i) => (
            <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '6px 14px 6px 9px', borderRadius: 8, background: '#EAF6E4', border: '1px solid rgba(46,158,79,.25)' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1F6B3A' }}>{b}</span>
              <Handle type="source" position={Position.Right} id={`btn-${i}`} style={{ ...handleStyle, right: -7, top: '50%' }} />
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

export function SendTextNode({ id, data }) {
  const { updateNodeData } = useReactFlow();
  return (
    <Shell icon={IconTemplate} title="Send Text">
      <Handle type="target" position={Position.Left} id="in" style={targetStyle} />
      <span style={labelStyle}>MESSAGE (24h window)</span>
      <textarea className="nodrag" rows={3} value={data.text || ''} onChange={e => updateNodeData(id, { text: e.target.value })} placeholder="Type a message…"
        style={{ ...selectStyle, resize: 'none', lineHeight: 1.4 }} />
      <Handle type="source" position={Position.Right} id="out" style={handleStyle} />
    </Shell>
  );
}

export function IfElseNode({ id, data }) {
  const { updateNodeData } = useReactFlow();
  return (
    <Shell icon={IconBranch} title="If / else">
      <Handle type="target" position={Position.Left} id="in" style={targetStyle} />
      <span style={labelStyle}>IF FIELD</span>
      <select className="nodrag" value={data.field || 'lead_status'} onChange={e => updateNodeData(id, { field: e.target.value })} style={{ ...selectStyle, marginBottom: 7 }}>
        <option value="lead_status">Lead Status</option>
        <option value="lead_score">Lead Score</option>
        <option value="source">Source</option>
        <option value="city">City</option>
      </select>
      <input className="nodrag" value={data.value || ''} onChange={e => updateNodeData(id, { value: e.target.value })} placeholder="equals value…" style={selectStyle} />
      <div style={{ position: 'relative', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#3B6B45' }}>TRUE</span>
          <Handle type="source" position={Position.Right} id="true" style={{ ...handleStyle, right: -7, top: '50%' }} />
        </div>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#C7503B' }}>FALSE</span>
          <Handle type="source" position={Position.Right} id="false" style={{ ...handleStyle, right: -7, top: '50%', border: '2px solid #C7503B' }} />
        </div>
      </div>
    </Shell>
  );
}

export function DelayNode({ id, data }) {
  const { updateNodeData } = useReactFlow();
  return (
    <Shell icon={IconClock} title="Delay" tint="#FFF1DC">
      <Handle type="target" position={Position.Left} id="in" style={targetStyle} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 12, color: 'rgba(27,76,94,.65)', fontWeight: 600 }}>Wait</span>
        <input className="nodrag" type="number" min="0" value={data.amount ?? 1} onChange={e => updateNodeData(id, { amount: Number(e.target.value) })}
          style={{ ...selectStyle, width: 56 }} />
        <select className="nodrag" value={data.unit || 'hours'} onChange={e => updateNodeData(id, { unit: e.target.value })} style={{ ...selectStyle, width: 'auto', flex: 1 }}>
          <option value="minutes">minutes</option>
          <option value="hours">hours</option>
          <option value="days">days</option>
        </select>
      </div>
      <Handle type="source" position={Position.Right} id="out" style={handleStyle} />
    </Shell>
  );
}

export function WaitReplyNode() {
  return (
    <Shell icon={IconInbox} title="Wait for Reply">
      <Handle type="target" position={Position.Left} id="in" style={targetStyle} />
      <div style={{ fontSize: 11.5, color: 'rgba(27,76,94,.6)', lineHeight: 1.4, marginBottom: 10 }}>Pause until the customer responds, then branch:</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#3B6B45' }}>Button tap</span>
          <Handle type="source" position={Position.Right} id="button" style={{ ...handleStyle, right: -7, top: '50%' }} />
        </div>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#3F6FA8' }}>Free text</span>
          <Handle type="source" position={Position.Right} id="text" style={{ ...handleStyle, right: -7, top: '50%', border: '2px solid #3F6FA8' }} />
        </div>
      </div>
    </Shell>
  );
}

const ACTION_LABELS = { status: 'Update Lead Status', score: 'Update Lead Score', tag: 'Add Tag' };
export function ActionNode({ id, data }) {
  const { updateNodeData } = useReactFlow();
  return (
    <Shell icon={IconDb} title={ACTION_LABELS[data.action] || 'Action'} tint="#F3ECFB">
      <Handle type="target" position={Position.Left} id="in" style={targetStyle} />
      {data.action === 'status' && (
        <select className="nodrag" value={data.value || 'Hot'} onChange={e => updateNodeData(id, { value: e.target.value })} style={selectStyle}>
          {['New', 'Cool', 'Warm', 'Hot', 'Won', 'Lost'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {data.action === 'score' && (
        <input className="nodrag" value={data.value || '+10'} onChange={e => updateNodeData(id, { value: e.target.value })} placeholder="+10" style={selectStyle} />
      )}
      {data.action === 'tag' && (
        <input className="nodrag" value={data.value || ''} onChange={e => updateNodeData(id, { value: e.target.value })} placeholder="tag name" style={selectStyle} />
      )}
      <Handle type="source" position={Position.Right} id="out" style={handleStyle} />
    </Shell>
  );
}

export const nodeTypes = {
  trigger: TriggerNode,
  sendTemplate: SendTemplateNode,
  sendText: SendTextNode,
  ifElse: IfElseNode,
  delay: DelayNode,
  waitReply: WaitReplyNode,
  action: ActionNode,
};

// Palette shown in the side panel (draggable onto the canvas).
export const PALETTE = [
  { group: 'TRIGGERS', items: [
    { type: 'trigger', label: 'New Lead', Icon: IconFacebook, data: { trigger: 'new_lead' } },
    { type: 'trigger', label: 'Inbound Message', Icon: IconInbox, data: { trigger: 'inbound' } },
    { type: 'trigger', label: 'Keyword', Icon: IconBranch, data: { trigger: 'keyword', keyword: '' } },
    { type: 'trigger', label: 'Manual', Icon: IconFlow, data: { trigger: 'manual' } },
  ]},
  { group: 'MESSAGE', items: [
    { type: 'sendTemplate', label: 'Send Template', Icon: IconWhatsApp, data: { templateName: '' } },
    { type: 'sendText', label: 'Send Text', Icon: IconTemplate, data: { text: '' } },
  ]},
  { group: 'LOGIC', items: [
    { type: 'ifElse', label: 'If / else', Icon: IconBranch, data: { field: 'lead_status', value: '' } },
    { type: 'delay', label: 'Delay', Icon: IconClock, data: { amount: 1, unit: 'hours' } },
  ]},
  { group: 'WAIT', items: [
    { type: 'waitReply', label: 'Wait for Reply', Icon: IconInbox, data: {} },
  ]},
  { group: 'ACTIONS', items: [
    { type: 'action', label: 'Update Lead Status', Icon: IconDb, data: { action: 'status', value: 'Hot' } },
    { type: 'action', label: 'Update Lead Score', Icon: IconDb, data: { action: 'score', value: '+10' } },
    { type: 'action', label: 'Add Tag', Icon: IconPeople, data: { action: 'tag', value: '' } },
  ]},
];

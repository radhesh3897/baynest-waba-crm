import { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState, useReactFlow, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes, PALETTE } from './flowNodes';
import { getFlowGraph as getSeedGraph } from '../dataAdapter';
import { useIsMobile } from '../useIsMobile';
import {
  getFlowList, createFlowRecord, getFlowGraphLive, saveFlowGraphLive, setFlowGraphStatus, deleteFlowRecord,
  loadTemplatesCache, getCachedTemplateButtons as getTemplateButtons, sendTemplateTest,
} from '../liveData';
import { IconPlus, IconChevDown } from '../icons';

const FOREST = 'var(--brand-primary)';
const LIME = '#73CF6F';

function describeEdge(sourceNode, sourceHandle) {
  if (!sourceNode || !sourceHandle) return { label: null, sourceButton: null };
  if (sourceNode.type === 'sendTemplate' && sourceHandle.startsWith('btn-')) {
    const idx = parseInt(sourceHandle.slice(4), 10);
    const btn = getTemplateButtons(sourceNode.data.templateName)[idx];
    return { label: btn || `Button ${idx + 1}`, sourceButton: btn || null };
  }
  if (sourceNode.type === 'ifElse') {
    if (sourceHandle === 'true') return { label: 'True', sourceButton: 'true' };
    if (sourceHandle === 'false') return { label: 'False', sourceButton: 'false' };
  }
  if (sourceNode.type === 'waitReply') {
    if (sourceHandle === 'button') return { label: 'Button tap', sourceButton: 'button' };
    if (sourceHandle === 'text') return { label: 'Free text', sourceButton: 'text' };
  }
  return { label: null, sourceButton: null };
}

const edgeBase = {
  type: 'smoothstep',
  animated: true,
  markerEnd: { type: MarkerType.ArrowClosed, color: '#7Fae86' },
  style: { stroke: '#7FAE86', strokeWidth: 2 },
  labelStyle: { fontSize: 11, fontWeight: 800, fill: FOREST },
  labelBgStyle: { fill: '#EAF6E4' },
  labelBgPadding: [6, 3],
  labelBgBorderRadius: 6,
};

const statusStyle = (s) => ({
  active: { bg: '#EAF6E4', fg: '#2E9E4F', label: 'Live' },
  paused: { bg: '#FFF1DC', fg: '#B6743A', label: 'Paused' },
  draft:  { bg: 'rgba(21,81,75,.08)', fg: 'rgba(21,81,75,.6)', label: 'Draft' },
}[s] || { bg: 'rgba(21,81,75,.08)', fg: 'rgba(21,81,75,.6)', label: 'Draft' });

let _idSeq = 1;
const newId = () => `node_${Date.now()}_${_idSeq++}`;

function Builder() {
  const isMobile = useIsMobile();
  const { screenToFlowPosition, getNodes, fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [flowList, setFlowList] = useState([]);
  const [flowId, setFlowId] = useState(null);
  const [flowName, setFlowName] = useState('');
  const [status, setStatus] = useState('draft');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [view, setView] = useState('list');   // 'list' (all workflows) | 'builder'
  const [showTest, setShowTest] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  async function handleTest() {
    setTestResult(null);
    const tplNode = getNodes().find(n => n.type === 'sendTemplate' && n.data?.templateName);
    if (!tplNode) { setTestResult({ ok: false, msg: 'Add a Send Template node (with a template chosen) to test.' }); return; }
    if (!testPhone.trim()) { setTestResult({ ok: false, msg: 'Enter a phone number to test.' }); return; }
    setTesting(true);
    const res = await sendTemplateTest(testPhone.trim(), tplNode.data.templateName, tplNode.data.variables || {});
    setTesting(false);
    if (res.ok) setTestResult({ ok: true, msg: `Sent to ${res.sent_to}`, preview: res.preview });
    else setTestResult({ ok: false, msg: res.error || 'Test failed' });
  }

  // Load a flow's graph onto the canvas.
  const loadFlow = useCallback(async (id) => {
    const g = await getFlowGraphLive(id);
    if (!g) return;
    setFlowId(g.id);
    setFlowName(g.name);
    setStatus(g.status);
    setNodes(g.nodes);
    setEdges(g.edges.map(e => ({ ...edgeBase, ...e })));
    setTimeout(() => fitView({ padding: 0.25, duration: 300 }), 60);
  }, [setNodes, setEdges, fitView]);

  // First load: fetch list; seed the demo flow if the workspace is empty.
  useEffect(() => {
    (async () => {
      await loadTemplatesCache();   // real Meta templates for the Send Template node
      let list = await getFlowList();
      if (list.length === 0) {
        const seed = getSeedGraph();
        const res = await createFlowRecord(seed.name);
        if (res.ok) {
          await saveFlowGraphLive(res.id, { name: seed.name, status: 'draft', nodes: seed.nodes, edges: seed.edges });
          list = await getFlowList();
        }
      }
      setFlowList(list);
      setLoading(false);
    })();
  }, [loadFlow]);

  async function refreshList() { setFlowList(await getFlowList()); }

  // Keep the workflow list metrics fresh (near real-time) while it's open.
  useEffect(() => {
    if (view !== 'list') return;
    const t = setInterval(() => { getFlowList().then(setFlowList); }, 15000);
    return () => clearInterval(t);
  }, [view]);

  async function openFlow(id) { await loadFlow(id); setView('builder'); }
  async function toggleStatusInList(f) {
    const next = f.status === 'active' ? 'paused' : 'active';
    await setFlowGraphStatus(f.id, next);
    refreshList();
  }
  async function deleteFromList(f) {
    if (!window.confirm(`Delete the workflow “${f.name}”? This cannot be undone.`)) return;
    await deleteFlowRecord(f.id);
    refreshList();
  }

  const onConnect = useCallback((params) => {
    const src = getNodes().find(n => n.id === params.source);
    const { label, sourceButton } = describeEdge(src, params.sourceHandle);
    setEdges(eds => addEdge({ ...edgeBase, ...params, label: label || undefined, data: { sourceButton } }, eds));
  }, [getNodes, setEdges]);

  const onDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/reactflow');
    if (!raw) return;
    const { type, data } = JSON.parse(raw);
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setNodes(nds => [...nds, { id: newId(), type, position, data: { ...data } }]);
  }, [screenToFlowPosition, setNodes]);

  async function persist(nextStatus) {
    if (!flowId) return;
    setSaving(true); setToast('');
    const res = await saveFlowGraphLive(flowId, {
      name: flowName,
      status: nextStatus ?? status,
      nodes: getNodes().map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null, label: e.label ?? null, data: { sourceButton: e.data?.sourceButton ?? null } })),
    });
    setSaving(false);
    if (res.ok) {
      if (nextStatus) setStatus(nextStatus);
      setToast(nextStatus === 'active' ? 'Published — flow is live' : nextStatus === 'paused' ? 'Paused' : 'Saved');
      refreshList();
      setTimeout(() => setToast(''), 2400);
    } else {
      setToast(res.error || 'Save failed');
    }
  }

  async function handleNewFlow() {
    const res = await createFlowRecord('New flow');
    if (!res.ok) return;
    await saveFlowGraphLive(res.id, {
      name: 'New flow', status: 'draft',
      nodes: [{ id: 'trigger_1', type: 'trigger', position: { x: 80, y: 220 }, data: { trigger: 'new_lead' } }],
      edges: [],
    });
    await refreshList();
    await loadFlow(res.id);
    setPickerOpen(false);
    setView('builder');
  }

  async function handleDelete() {
    if (!flowId) return;
    if (!window.confirm(`Delete the workflow “${flowName}”? This cannot be undone.`)) return;
    await deleteFlowRecord(flowId);
    await refreshList();
    setView('list');
  }

  // ── Workflows list (the in-between page) — detailed metrics view ──
  if (view === 'list') {
    const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const tot = key => flowList.reduce((s, f) => s + (Number(f[key]) || 0), 0);
    const metricBox = (label, value, danger) => (
      <div key={label} style={{ background: '#F6FAF6', border: '1px solid rgba(21,81,75,.08)', borderRadius: 10, padding: '10px 12px', flex: 1, minWidth: isMobile ? '40%' : 96 }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', color: 'rgba(21,81,75,.5)' }}>{String(label).toUpperCase()}</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: danger ? '#C7503B' : FOREST, marginTop: 3, letterSpacing: '-.01em' }}>{value}</div>
      </div>
    );
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '18px 16px 28px' : '22px 30px 36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: FOREST }}>Workflows <span style={{ color: 'rgba(21,81,75,.45)', fontWeight: 700 }}>({flowList.length})</span></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={refreshList} style={{ background: '#fff', border: '1px solid rgba(21,81,75,.16)', color: FOREST, fontSize: 12.5, fontWeight: 700, padding: '9px 14px', borderRadius: 10, cursor: 'pointer' }}>Refresh</button>
            <button onClick={handleNewFlow} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: LIME, border: 'none', color: 'var(--brand-primary-dark)', fontSize: 13, fontWeight: 800, padding: '10px 16px', borderRadius: 10, cursor: 'pointer' }}><IconPlus size={15} /> New workflow</button>
          </div>
        </div>

        {/* Totals across all flows */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          {metricBox('Times triggered', tot('triggered'))}
          {metricBox('Messages sent', tot('sent'))}
          {metricBox('Failed', tot('failed'), tot('failed') > 0)}
          {metricBox('Est. spend', money(tot('costRupees')))}
        </div>

        {loading && <div style={{ color: 'rgba(21,81,75,.5)', fontSize: 14 }}>Loading workflows…</div>}
        {!loading && flowList.length === 0 && <div style={{ color: 'rgba(21,81,75,.55)', fontSize: 13.5 }}>No workflows yet — create your first one.</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {flowList.map(f => {
            const fs = statusStyle(f.status);
            const actionLabel = f.status === 'active' ? 'Pause' : f.status === 'paused' ? 'Resume' : 'Publish';
            return (
              <div key={f.id} style={{ background: '#fff', border: '1px solid rgba(21,81,75,.10)', borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 3px rgba(14,58,53,.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 800, color: FOREST, lineHeight: 1.3, wordBreak: 'break-word' }}>{f.name}</span>
                    <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: fs.fg, background: fs.bg, padding: '3px 9px', borderRadius: 999 }}>
                      {f.status === 'active' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: fs.fg }} />}{fs.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button onClick={() => openFlow(f.id)} style={{ background: 'var(--brand-primary)', border: 'none', color: '#EAF6E4', fontSize: 12.5, fontWeight: 700, padding: '8px 14px', borderRadius: 9, cursor: 'pointer' }}>Open</button>
                    <button onClick={() => toggleStatusInList(f)} style={{ background: f.status === 'active' ? '#FFF1DC' : '#EAF6E4', border: 'none', color: f.status === 'active' ? '#B6743A' : '#2E9E4F', fontSize: 12.5, fontWeight: 700, padding: '8px 12px', borderRadius: 9, cursor: 'pointer' }}>{actionLabel}</button>
                    <button onClick={() => deleteFromList(f)} title="Delete" style={{ background: '#fff', border: '1px solid rgba(21,81,75,.16)', color: '#C7503B', fontSize: 12.5, fontWeight: 700, padding: '8px 11px', borderRadius: 9, cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {metricBox('Triggered', f.triggered)}
                  {metricBox('Sent', f.sent)}
                  {metricBox('Failed', f.failed, f.failed > 0)}
                  {metricBox('Est. cost', money(f.costRupees))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 11, color: 'rgba(21,81,75,.4)', marginTop: 16, lineHeight: 1.55 }}>
          “Triggered” = leads that entered the flow · “Sent” = WhatsApp messages this flow sent · cost is estimated from each template’s category (Marketing ₹0.79, Utility ₹0.12, Auth ₹0.14 per message; free-text replies are free). Auto-refreshes every 15s.
        </div>
      </div>
    );
  }

  const ss = statusStyle(status);

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* Palette */}
      <div style={{ width: isMobile ? 150 : 220, flexShrink: 0, background: '#fff', borderRight: '1px solid rgba(21,81,75,.10)', overflowY: 'auto', padding: isMobile ? '12px 8px' : '16px 12px' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: FOREST, padding: '0 4px 6px' }}>Blocks</div>
        <div style={{ fontSize: 11, color: 'rgba(21,81,75,.5)', padding: '0 4px 14px', lineHeight: 1.45 }}>Drag a block onto the canvas, then connect them.</div>
        {PALETTE.map(group => (
          <div key={group.group} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: 'rgba(21,81,75,.42)', marginBottom: 8, padding: '0 4px' }}>{group.group}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {group.items.map((it, i) => (
                <div key={i} draggable
                  onDragStart={e => { e.dataTransfer.setData('application/reactflow', JSON.stringify({ type: it.type, data: it.data })); e.dataTransfer.effectAllowed = 'move'; }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, border: '1px solid rgba(21,81,75,.12)', background: '#fff', cursor: 'grab', userSelect: 'none' }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: '#F2F8F2', color: '#356E63', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, flexShrink: 0 }}>
                    <it.Icon size={16} />
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: FOREST }}>{it.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }} onDrop={onDrop} onDragOver={onDragOver}>
        {/* Toolbar */}
        <div style={{ position: 'absolute', top: 14, left: 16, right: 16, zIndex: 5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, rowGap: 8, pointerEvents: 'none', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, rowGap: 8, pointerEvents: 'auto', flexWrap: 'wrap' }}>
            <button onClick={() => { setView('list'); refreshList(); }} title="All workflows" style={{ background: '#fff', border: '1px solid rgba(21,81,75,.16)', borderRadius: 10, padding: '9px 13px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: FOREST, boxShadow: '0 2px 8px rgba(14,58,53,.06)' }}>← All</button>
            {/* Flow picker */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setPickerOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid rgba(21,81,75,.16)', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: FOREST, boxShadow: '0 2px 8px rgba(14,58,53,.06)' }}>
                <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{flowName || 'Flows'}</span>
                <IconChevDown size={13} />
              </button>
              {pickerOpen && (
                <div style={{ position: 'absolute', top: '112%', left: 0, background: '#fff', border: '1px solid rgba(21,81,75,.14)', borderRadius: 11, boxShadow: '0 10px 28px rgba(14,58,53,.14)', minWidth: 260, overflow: 'hidden', zIndex: 20 }}>
                  {flowList.map(f => {
                    const fs = statusStyle(f.status);
                    return (
                      <button key={f.id} onClick={() => { loadFlow(f.id); setPickerOpen(false); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', textAlign: 'left', padding: '10px 13px', background: f.id === flowId ? '#F2F8F2' : '#fff', border: 'none', borderBottom: '1px solid rgba(21,81,75,.06)', cursor: 'pointer', fontSize: 13, color: FOREST, fontWeight: f.id === flowId ? 700 : 500 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, background: fs.bg, color: fs.fg, padding: '2px 8px', borderRadius: 999 }}>{fs.label}</span>
                      </button>
                    );
                  })}
                  <button onClick={handleNewFlow} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '11px 13px', background: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, color: '#2E9E4F', fontWeight: 800 }}>
                    <IconPlus size={14} /> New flow
                  </button>
                </div>
              )}
            </div>

            <input value={flowName} onChange={e => setFlowName(e.target.value)} placeholder="Flow name"
              style={{ background: '#fff', border: '1px solid rgba(21,81,75,.16)', borderRadius: 10, padding: '9px 13px', fontSize: 14, fontWeight: 700, color: FOREST, outline: 'none', fontFamily: 'inherit', minWidth: isMobile ? 120 : 220, maxWidth: isMobile ? 160 : 'none', boxShadow: '0 2px 8px rgba(14,58,53,.06)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, background: ss.bg, color: ss.fg, padding: '5px 11px', borderRadius: 999 }}>{ss.label}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 9, rowGap: 8, pointerEvents: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {toast && <span style={{ background: 'var(--brand-primary-dark)', color: '#A9E0A0', fontSize: 12, fontWeight: 700, padding: '7px 13px', borderRadius: 999 }}>{toast}</span>}
            <span style={{ position: 'relative' }}>
              <button onClick={() => { setShowTest(v => !v); setTestResult(null); }} style={{ background: showTest ? '#EAF6E4' : '#fff', border: '1px solid rgba(21,81,75,.16)', color: FOREST, fontSize: 13, fontWeight: 700, padding: '9px 15px', borderRadius: 10, cursor: 'pointer' }}>Test</button>
              {showTest && (
                <>
                  <div onClick={() => setShowTest(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                  <div style={{ position: 'absolute', top: '120%', right: 0, width: 300, background: '#fff', border: '1px solid rgba(21,81,75,.14)', borderRadius: 12, boxShadow: '0 12px 32px rgba(14,58,53,.18)', zIndex: 50, padding: 16 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: FOREST, marginBottom: 4 }}>Send a test</div>
                    <div style={{ fontSize: 11.5, color: 'rgba(21,81,75,.55)', marginBottom: 10, lineHeight: 1.45 }}>Sends this flow's template to the number below (must be a contact in People). Variables fill from that contact.</div>
                    <input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="+91 98765 43210" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid rgba(21,81,75,.18)', borderRadius: 9, padding: '9px 11px', fontSize: 13, color: FOREST, outline: 'none', fontFamily: 'inherit', marginBottom: 10 }} />
                    <button onClick={handleTest} disabled={testing} style={{ width: '100%', background: LIME, border: 'none', color: 'var(--brand-primary-dark)', fontSize: 13, fontWeight: 800, padding: '10px', borderRadius: 9, cursor: testing ? 'default' : 'pointer', opacity: testing ? 0.6 : 1 }}>{testing ? 'Sending…' : 'Send test message'}</button>
                    {testResult && (
                      <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: testResult.ok ? '#2E7D45' : '#C7503B', background: testResult.ok ? '#EAF6E4' : '#FDECEA', borderRadius: 8, padding: '9px 10px', lineHeight: 1.5 }}>
                        {testResult.ok ? '✓ ' : ''}{testResult.msg}
                        {testResult.preview && <div style={{ marginTop: 6, color: 'rgba(21,81,75,.7)', fontWeight: 500, fontStyle: 'italic' }}>“{testResult.preview}”</div>}
                      </div>
                    )}
                  </div>
                </>
              )}
            </span>
            <button onClick={handleDelete} title="Delete flow" style={{ background: '#fff', border: '1px solid rgba(21,81,75,.16)', color: '#C7503B', fontSize: 13, fontWeight: 700, padding: '9px 13px', borderRadius: 10, cursor: 'pointer' }}>Delete</button>
            <button onClick={() => persist()} disabled={saving} style={{ background: '#fff', border: '1px solid rgba(21,81,75,.16)', color: FOREST, fontSize: 13, fontWeight: 700, padding: '9px 15px', borderRadius: 10, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
            {status === 'active'
              ? <button onClick={() => persist('paused')} style={{ background: '#FFF1DC', border: 'none', color: '#B6743A', fontSize: 13, fontWeight: 800, padding: '10px 18px', borderRadius: 10, cursor: 'pointer' }}>Pause</button>
              : <button onClick={() => persist('active')} style={{ background: LIME, border: 'none', color: 'var(--brand-primary-dark)', fontSize: 13.5, fontWeight: 800, padding: '10px 18px', borderRadius: 10, cursor: 'pointer' }}>Publish</button>}
          </div>
        </div>

        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(21,81,75,.5)', fontSize: 14, zIndex: 4 }}>Loading flows…</div>
        )}

        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          nodeTypes={nodeTypes} defaultEdgeOptions={edgeBase}
          deleteKeyCode={['Backspace', 'Delete']} fitView fitViewOptions={{ padding: 0.25 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="rgba(21,81,75,.18)" />
          <Controls />
          <MiniMap pannable zoomable nodeColor="#A9E0A0" maskColor="rgba(21,81,75,.06)" style={{ background: '#fff', border: '1px solid rgba(21,81,75,.12)' }} />
        </ReactFlow>
      </div>

      {pickerOpen && <div onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 4 }} />}
    </div>
  );
}

export default function Automation() {
  const isMobile = useIsMobile();
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <header style={{ padding: isMobile ? '14px 16px 12px' : '18px 30px 14px', borderBottom: '1px solid rgba(21,81,75,.08)', background: '#fff' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: 'rgba(21,81,75,.45)' }}>AUTOMATION</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 21, fontWeight: 800, letterSpacing: '-.01em', color: FOREST }}>Flow Builder</h1>
      </header>
      <ReactFlowProvider>
        <Builder />
      </ReactFlowProvider>
    </div>
  );
}

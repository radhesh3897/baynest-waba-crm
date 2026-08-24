import { useState, useEffect } from 'react';
import { getStageConfig, moveLeadToPipeline, setDealValue } from '../liveData';
import {
  LEAD_STAGES, DEAL_STAGES, PIPELINES, DEAD_STAGES, pipelineOf, formatCr,
} from '../pipeline';

const selectArrow = `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2315514B' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`;

// Move a lead between the two boards, and set where it lands.
//
// This is the control Manish reaches for on a phone, where dragging a kanban
// card is not realistic. It lives in every lead detail view — CRM, Inbox,
// Visits — so wherever he opens a lead he can re-file it without going back to
// the board. On the Deal side it also carries the rupee value, because that is
// the only thing that separates a deal from a lead.
export default function PipelineMover({
  contactId, stage, dealValue = null, dealValueIsManual = false,
  onMoved, onValueChange, compact = false,
}) {
  const [cfg, setCfg] = useState({ lead: LEAD_STAGES, deal: DEAL_STAGES });
  const [cur, setCur] = useState(stage || 'New');
  const [busy, setBusy] = useState(false);
  const [editingValue, setEditingValue] = useState(false);
  const [draftValue, setDraftValue] = useState('');
  const [value, setValue] = useState(dealValue);
  const [manual, setManual] = useState(dealValueIsManual);

  useEffect(() => { getStageConfig().then(setCfg); }, []);
  useEffect(() => { setCur(stage || 'New'); }, [stage]);
  useEffect(() => { setValue(dealValue); setManual(dealValueIsManual); }, [dealValue, dealValueIsManual]);

  const pipeline = pipelineOf(cur, cfg.deal);
  const stages = pipeline === 'deal' ? cfg.deal : cfg.lead;

  async function apply(nextPipeline, nextStage) {
    if (busy || nextStage === cur) return;
    const prev = cur;
    setCur(nextStage);                      // optimistic
    setBusy(true);
    const res = await moveLeadToPipeline(contactId, nextPipeline, nextStage);
    setBusy(false);
    if (res.ok) {
      setCur(res.lead_status);
      onMoved?.(res.lead_status, res.pipeline);
    } else {
      setCur(prev);
      alert('Could not move this lead: ' + (res.error || 'unknown error'));
    }
  }

  function switchPipeline(key) {
    if (key === pipeline) return;
    const list = key === 'deal' ? cfg.deal : cfg.lead;
    // Into Deals, land on the first stage. Back into Leads, land on the last
    // live stage rather than New — going back is a correction, not a reset.
    const live = list.filter(s => !DEAD_STAGES.includes(s));
    apply(key, key === 'deal' ? (live[0] || list[0]) : (live[live.length - 1] || list[0]));
  }

  async function saveValue() {
    const raw = draftValue.trim();
    setEditingValue(false);
    const res = await setDealValue(contactId, raw === '' ? null : raw);
    if (res.ok) {
      setValue(res.deal_value_cr);
      setManual(!!res.deal_value_is_manual);
      onValueChange?.(res.deal_value_cr, !!res.deal_value_is_manual);
    } else {
      alert('Could not set the deal value: ' + (res.error || 'unknown error'));
    }
  }

  const label = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)', marginBottom: 6, textTransform: 'uppercase' };

  return (
    <div style={{ opacity: busy ? .6 : 1, transition: 'opacity .15s' }}>
      <div style={label}>Pipeline</div>

      {/* Board switch */}
      <div style={{ display: 'flex', gap: 3, background: '#F2F6F3', border: '1px solid rgba(27,76,94,.12)', borderRadius: 10, padding: 3, marginBottom: 10 }}>
        {PIPELINES.map(p => {
          const on = pipeline === p.key;
          return (
            <button key={p.key} type="button" disabled={busy} onClick={() => switchPipeline(p.key)}
              style={{
                flex: 1, padding: compact ? '7px 6px' : '8px 6px', borderRadius: 8, border: 'none',
                cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', lineHeight: 1.25,
                background: on ? 'var(--brand-primary)' : 'transparent',
                color: on ? '#fff' : 'rgba(27,76,94,.65)',
              }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: on ? 800 : 600 }}>{p.label}</span>
              <span style={{ display: 'block', fontSize: 9.5, fontWeight: 600, opacity: on ? .75 : .55 }}>{p.blurb}</span>
            </button>
          );
        })}
      </div>

      {/* Stage within that board */}
      <div style={label}>{pipeline === 'deal' ? 'Deal stage' : 'Lead status'}</div>
      <select value={cur} disabled={busy} onChange={e => apply(pipeline, e.target.value)}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '10px 30px 10px 12px',
          border: '1px solid rgba(27,76,94,.18)', borderRadius: 9, fontSize: 13, fontWeight: 700,
          color: 'var(--brand-primary)', background: '#fff', outline: 'none', fontFamily: 'inherit',
          appearance: 'none', backgroundImage: selectArrow, backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 11px center', cursor: busy ? 'default' : 'pointer',
        }}>
        {stages.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      {/* Deal value — only meaningful once there is a deal */}
      {pipeline === 'deal' && (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...label, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span>Deal value</span>
            {manual && (
              <button type="button" onClick={async () => {
                const res = await setDealValue(contactId, null);
                if (res.ok) { setValue(res.deal_value_cr); setManual(false); onValueChange?.(res.deal_value_cr, false); }
              }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 700, color: 'rgba(27,76,94,.45)', textDecoration: 'underline', padding: 0, letterSpacing: 0, textTransform: 'none' }}>
                reset to automatic
              </button>
            )}
          </div>

          {editingValue ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input autoFocus type="number" step="0.01" min="0" value={draftValue}
                onChange={e => setDraftValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveValue(); if (e.key === 'Escape') setEditingValue(false); }}
                placeholder="e.g. 18"
                style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '9px 12px', border: '1px solid rgba(27,76,94,.18)', borderRadius: 9, fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)', outline: 'none', fontFamily: 'inherit' }} />
              <button type="button" onClick={saveValue} style={{ border: 'none', background: 'var(--brand-primary)', color: '#fff', borderRadius: 9, padding: '0 14px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
            </div>
          ) : (
            <button type="button" onClick={() => { setDraftValue(value == null ? '' : String(value)); setEditingValue(true); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 12px', border: '1px solid rgba(27,76,94,.18)', borderRadius: 9, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: value ? 'var(--brand-primary)' : 'rgba(27,76,94,.35)' }}>{formatCr(value, { dash: 'Not set' })}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(27,76,94,.4)' }}>{manual ? 'SET BY YOU' : 'AUTOMATIC'}</span>
            </button>
          )}

          <div style={{ fontSize: 10.5, color: 'rgba(27,76,94,.45)', lineHeight: 1.45, marginTop: 6 }}>
            {manual
              ? 'Fixed at this figure until you reset it.'
              : 'Follows the highest-priced project tagged to this lead, or their stated budget. One value per lead, never a total of every project they liked.'}
          </div>
        </div>
      )}
    </div>
  );
}

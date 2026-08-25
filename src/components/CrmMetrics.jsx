import { useState, useEffect, useMemo } from 'react';
import { getCrmMetrics } from '../liveData';
import { LEAD_STAGES, DEAL_STAGES, STAGE_CHIP } from '../pipeline';

const CARD = { background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 14, padding: '14px 15px' };
const LABEL = { fontSize: 10, fontWeight: 800, letterSpacing: '.07em', color: 'rgba(27,76,94,.5)', textTransform: 'uppercase' };

// "0.9" -> "54 sec", "3.8" -> "3.8 min", "1440" -> "1 day"
function humanMins(m) {
  const n = Number(m);
  if (!Number.isFinite(n)) return '—';
  if (n < 1) return `${Math.round(n * 60)} sec`;
  if (n < 60) return `${n < 10 ? n.toFixed(1).replace(/\.0$/, '') : Math.round(n)} min`;
  if (n < 1440) return `${(n / 60).toFixed(1).replace(/\.0$/, '')} hr`;
  const d = n / 1440;
  return `${d.toFixed(1).replace(/\.0$/, '')} day${d >= 2 ? 's' : ''}`;
}

const BUCKET_TONE = ['#3B6B45', '#7FA86B', '#C08A45', '#C7503B'];

// Speed to lead, and where everyone is sitting. Phone-only: on desktop the
// board itself already shows the shape of the pipeline at a glance, but a
// single-column list on a phone hides it completely.
export default function CrmMetrics({ pipeline, leadStages, dealStages }) {
  const [m, setM] = useState(null);
  const [open, setOpen] = useState(true);

  useEffect(() => { getCrmMetrics().then(setM); }, []);

  const order = pipeline === 'deal' ? (dealStages || DEAL_STAGES) : (leadStages || LEAD_STAGES);

  const dist = useMemo(() => {
    if (!m) return [];
    const rows = (m.stages || []).filter(s => s.pipeline === pipeline);
    const total = rows.reduce((t, r) => t + Number(r.n || 0), 0);
    // Every stage on the board, in board order. Empty stages stay visible —
    // "nothing has reached Negotiation" is the most useful thing this can say.
    return order.map(stage => {
      const n = Number(rows.find(r => r.stage === stage)?.n || 0);
      return { stage, n, pct: total ? (n / total) * 100 : 0 };
    });
  }, [m, pipeline, order]);

  const distTotal = dist.reduce((t, r) => t + r.n, 0);

  if (!m) {
    return <div style={{ ...CARD, fontSize: 12.5, color: 'rgba(27,76,94,.45)' }}>Loading pipeline health…</div>;
  }

  const sp = m.speed || {};
  const buckets = sp.buckets || [];
  const bucketTotal = buckets.reduce((t, b) => t + Number(b.n || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      <button onClick={() => setOpen(o => !o)} style={{
        ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%',
      }}>
        <span>
          <span style={{ ...LABEL, display: 'block', marginBottom: 3 }}>Speed to lead</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <strong style={{ fontSize: 25, fontWeight: 900, letterSpacing: '-.02em', color: 'var(--brand-primary)' }}>
              {humanMins(sp.medianMins)}
            </strong>
            <span style={{ fontSize: 11.5, color: 'rgba(27,76,94,.5)' }}>typical first reply</span>
          </span>
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(27,76,94,.4)' }}>{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <>
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 11 }}>
              <span style={LABEL}>How fast we replied</span>
              <span style={{ fontSize: 11, color: 'rgba(27,76,94,.45)' }}>
                {sp.measured} of {sp.total} leads
              </span>
            </div>

            {bucketTotal === 0 ? (
              <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.5)' }}>No replies sent yet.</div>
            ) : (
              <>
                {/* One stacked bar, then the legend — a pie of four slices is
                    harder to read than a line you can compare against full width. */}
                <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'rgba(27,76,94,.07)' }}>
                  {buckets.map((b, i) => Number(b.n) > 0 && (
                    <div key={b.label} title={`${b.label}: ${b.n}`}
                      style={{ width: `${(Number(b.n) / bucketTotal) * 100}%`, background: BUCKET_TONE[i] }} />
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 11 }}>
                  {buckets.map((b, i) => (
                    <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: BUCKET_TONE[i], flexShrink: 0 }} />
                      <span style={{ flex: 1, color: 'rgba(27,76,94,.62)' }}>{b.label}</span>
                      <span style={{ fontWeight: 800, color: 'var(--brand-primary)' }}>{b.n}</span>
                      <span style={{ width: 38, textAlign: 'right', color: 'rgba(27,76,94,.42)' }}>
                        {Math.round((Number(b.n) / bucketTotal) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(27,76,94,.45)', lineHeight: 1.45, marginTop: 10, paddingTop: 9, borderTop: '1px solid rgba(27,76,94,.07)' }}>
                  Measured from the lead arriving to our first message out.
                  9 in 10 within <strong style={{ color: 'rgba(27,76,94,.65)' }}>{humanMins(sp.p90Mins)}</strong>.
                  {sp.measured < sp.total && ` ${sp.total - sp.measured} leads have never been messaged.`}
                </div>
              </>
            )}
          </div>

          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
              <span style={LABEL}>{pipeline === 'deal' ? 'Deals by stage' : 'Leads by stage'}</span>
              <span style={{ fontSize: 11, color: 'rgba(27,76,94,.45)' }}>{distTotal} total</span>
            </div>

            {distTotal === 0 ? (
              <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.5)' }}>
                Nothing on this board yet.
              </div>
            ) : dist.map(r => {
              const tone = STAGE_CHIP[r.stage] || {};
              return (
                <div key={r.stage} style={{ marginBottom: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--brand-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.stage}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--brand-primary)' }}>{r.n}</span>
                    <span style={{ width: 40, textAlign: 'right', fontSize: 11.5, color: 'rgba(27,76,94,.45)' }}>
                      {r.pct >= 1 || r.pct === 0 ? Math.round(r.pct) : r.pct.toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ height: 7, borderRadius: 999, background: 'rgba(27,76,94,.06)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.max(r.pct, r.n > 0 ? 2 : 0)}%`, height: '100%', borderRadius: 999,
                      background: tone.bg && tone.bg.startsWith('var') ? 'var(--brand-primary)' : (tone.fg || 'var(--brand-muted)'),
                      transition: 'width .45s ease',
                    }} />
                  </div>
                </div>
              );
            })}

            {m.movesLast7 > 0 && (
              <div style={{ fontSize: 11, color: 'rgba(27,76,94,.45)', marginTop: 4, paddingTop: 9, borderTop: '1px solid rgba(27,76,94,.07)' }}>
                {m.movesLast7} stage change{m.movesLast7 === 1 ? '' : 's'} in the last 7 days
                {m.medianStageHours != null && ` · typically ${humanMins(Number(m.medianStageHours) * 60)} to leave New`}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

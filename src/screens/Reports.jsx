import { useState, useEffect, useMemo } from 'react';
import { getAdsReport } from '../liveData';
import { IconRefresh } from '../icons';
import { useIsMobile } from '../useIsMobile';

const inr  = (n, dp = 0) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const num  = (n) => Number(n || 0).toLocaleString('en-IN');
const pct  = (n) => Number(n || 0).toFixed(2) + '%';
// "2026-08" -> "Aug 2026"
const monthLabel = (m) => {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

const TH = { textAlign: 'left', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)', padding: '16px 14px 10px', textTransform: 'uppercase', whiteSpace: 'nowrap' };
const TD = { fontSize: 13, color: 'var(--brand-primary)', padding: '13px 14px', borderTop: '1px solid rgba(27,76,94,.07)', whiteSpace: 'nowrap' };
const R  = { textAlign: 'right' };

function Tile({ label, value, tone }) {
  const fg = tone === 'gold' ? '#8A5E22' : tone === 'good' ? '#3B6B45' : 'var(--brand-primary)';
  return (
    <div style={{ flex: 1, minWidth: 140, background: '#fff', border: '1px solid rgba(27,76,94,.08)', borderRadius: 14, padding: '15px 17px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: fg, marginTop: 5, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

export default function Reports() {
  const isMobile = useIsMobile();
  const [months, setMonths] = useState(6);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(m = months) {
    setLoading(true); setError('');
    const res = await getAdsReport(m);
    if (res && res.ok) setData(res); else setError(res?.error || 'Could not load the report.');
    setLoading(false);
  }
  useEffect(() => { load(months); /* eslint-disable-next-line */ }, [months]);

  // Merge Meta's monthly spend rows with our CRM's monthly lead quality.
  const rows = useMemo(() => {
    if (!data) return [];
    const q = Object.fromEntries((data.quality || []).map(x => [x.month, x]));
    return (data.months || []).map(m => ({ ...m, q: q[m.month] || null }));
  }, [data]);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    spend: a.spend + (r.spend || 0),
    leads: a.leads + (r.leads || 0),
    clicks: a.clicks + (r.clicks || 0),
    impressions: a.impressions + (r.impressions || 0),
    qualified: a.qualified + Number(r.q?.qualified || 0),
  }), { spend: 0, leads: 0, clicks: 0, impressions: 0, qualified: 0 }), [rows]);

  const avgCpl = totals.leads > 0 ? totals.spend / totals.leads : null;
  const avgCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: isMobile ? '18px 14px 32px' : '26px 30px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? 21 : 26, fontWeight: 800, color: 'var(--brand-primary)', letterSpacing: '-.01em' }}>Reports</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={months} onChange={e => setMonths(Number(e.target.value))}
            style={{ border: '1px solid rgba(27,76,94,.16)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: 'var(--brand-primary)', background: '#fff', fontFamily: 'inherit', cursor: 'pointer' }}>
            {[3, 6, 12].map(m => <option key={m} value={m}>Last {m} months</option>)}
          </select>
          <button onClick={() => load()} disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--brand-primary)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, padding: '9px 15px', borderRadius: 10, cursor: loading ? 'default' : 'pointer', opacity: loading ? .7 : 1 }}>
            <IconRefresh size={14} /> Refresh
          </button>
        </div>
      </div>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'rgba(27,76,94,.55)' }}>
        Ad spend, leads and cost per lead from Meta, month by month. Qualified / not qualified comes from your CRM.
      </p>

      {loading && <div style={{ padding: '60px 0', textAlign: 'center', color: 'rgba(27,76,94,.5)', fontSize: 14 }}>Loading report…</div>}

      {!loading && error && (
        <div style={{ background: 'rgba(199,80,59,.07)', border: '1px solid rgba(199,80,59,.18)', borderRadius: 14, padding: '20px 22px', color: '#C0392B' }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Couldn’t load the report</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{error}</div>
          <div style={{ fontSize: 12.5, marginTop: 10, color: 'rgba(27,76,94,.55)' }}>
            The ad account must be assigned to your Meta system user with <b>ads_read</b>. You can also pin one with the <b>META_AD_ACCOUNT_ID</b> secret.
          </div>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <Tile label="Total spend"   value={inr(totals.spend)} />
            <Tile label="Total leads"   value={num(totals.leads)} />
            <Tile label="Avg cost/lead" value={avgCpl != null ? inr(avgCpl) : '—'} tone="gold" />
            <Tile label="Avg CTR"       value={pct(avgCtr)} />
            <Tile label="Qualified"     value={num(totals.qualified)} tone="good" />
          </div>

          {rows.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid rgba(27,76,94,.08)', borderRadius: 14, padding: '28px 22px', color: 'rgba(27,76,94,.55)', fontSize: 13.5 }}>
              No ad activity in this period.
            </div>
          ) : isMobile ? (
            /* Phone: one card per month — a 9-column table doesn't fit. */
            rows.map(r => (
              <div key={r.month} style={{ background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 14, padding: '13px 14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--brand-primary)' }}>{monthLabel(r.month)}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--brand-primary)' }}>{inr(r.spend)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
                  {[['Leads', num(r.leads)], ['Cost/lead', r.cpl != null ? inr(r.cpl) : '—'], ['CTR', pct(r.ctr)]].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(27,76,94,.45)', textTransform: 'uppercase' }}>{k}</div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--brand-primary)', marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(115,167,111,.18)', color: '#3B6B45', padding: '3px 9px', borderRadius: 999 }}>Qualified {num(r.q?.qualified)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(199,80,59,.09)', color: 'rgba(199,80,59,.85)', padding: '3px 9px', borderRadius: 999 }}>Not qual. {num(r.q?.not_qualified)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(27,76,94,.07)', color: 'var(--brand-primary)', padding: '3px 9px', borderRadius: 999 }}>CRM total {num(r.q?.total)}</span>
                </div>
              </div>
            ))
          ) : (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(27,76,94,.08)', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={TH}>Month</th>
                      <th style={{ ...TH, ...R }}>Spend</th>
                      <th style={{ ...TH, ...R }}>Impressions</th>
                      <th style={{ ...TH, ...R }}>Clicks</th>
                      <th style={{ ...TH, ...R }}>CTR</th>
                      <th style={{ ...TH, ...R }}>Leads</th>
                      <th style={{ ...TH, ...R }}>Cost / lead</th>
                      <th style={{ ...TH, ...R }}>Qualified</th>
                      <th style={{ ...TH, ...R }}>Not qualified</th>
                      <th style={{ ...TH, ...R }}>CRM total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.month}>
                        <td style={{ ...TD, fontWeight: 700 }}>{monthLabel(r.month)}</td>
                        <td style={{ ...TD, ...R, fontWeight: 700 }}>{inr(r.spend)}</td>
                        <td style={{ ...TD, ...R, color: 'rgba(27,76,94,.7)' }}>{num(r.impressions)}</td>
                        <td style={{ ...TD, ...R, color: 'rgba(27,76,94,.7)' }}>{num(r.clicks)}</td>
                        <td style={{ ...TD, ...R }}>{pct(r.ctr)}</td>
                        <td style={{ ...TD, ...R, fontWeight: 700 }}>{num(r.leads)}</td>
                        <td style={{ ...TD, ...R, fontWeight: 700, color: '#8A5E22' }}>{r.cpl != null ? inr(r.cpl) : '—'}</td>
                        <td style={{ ...TD, ...R, color: '#3B6B45', fontWeight: 700 }}>{num(r.q?.qualified)}</td>
                        <td style={{ ...TD, ...R, color: 'rgba(199,80,59,.85)' }}>{num(r.q?.not_qualified)}</td>
                        <td style={{ ...TD, ...R, color: 'rgba(27,76,94,.7)' }}>{num(r.q?.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p style={{ margin: '14px 2px 0', fontSize: 11.5, color: 'rgba(27,76,94,.45)', lineHeight: 1.5 }}>
            Leads and cost per lead are Meta’s numbers for the ad account. Qualified / not qualified / CRM total count the
            leads in this tool by the month they arrived, so they can differ from Meta’s lead count.
          </p>
        </>
      )}
    </div>
  );
}

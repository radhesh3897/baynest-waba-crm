import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { IconRefresh, IconFacebook } from '../icons';
import { CLIENT } from '../config/client.js';
import { useIsMobile } from '../useIsMobile';
import { getMetaAdsInsights } from '../liveData';

const FOREST = 'var(--brand-primary)';
const AUTO_REFRESH_MS = 30 * 60 * 1000; // 30 min while the tab is open

const inr = (n, dp = 0) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const num = (n) => Number(n || 0).toLocaleString('en-IN');
const pct = (n) => Number(n || 0).toFixed(2) + '%';
const istTime = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) + ' IST';
  } catch { return ''; }
};

export default function MetaDashboard() {
  const isMobile = useIsMobile();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    if (firstLoad.current) setLoading(true); else setRefreshing(true);
    const res = await getMetaAdsInsights();
    if (res && res.ok && res.totals) {
      setData(res);
      setError('');
    } else {
      setError(res?.error || 'Could not load Meta data.');
    }
    setLoading(false);
    setRefreshing(false);
    firstLoad.current = false;
  }, []);

  // Refresh on open + auto-refresh every 30 min while mounted.
  useEffect(() => {
    load();
    const t = setInterval(load, AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const t = data?.totals;
  const aboveBench = t && t.cpl != null && data.benchmarkCpl != null && t.cpl > data.benchmarkCpl;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--app-bg)' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '18px 14px 32px' : '26px 28px 40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: '#fff', border: '1px solid rgba(27,76,94,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1877F2' }}>
              <IconFacebook size={22} />
            </div>
            <div>
              <div style={{ fontSize: isMobile ? 19 : 22, fontWeight: 800, letterSpacing: '-.3px', color: FOREST }}>Meta Dashboard</div>
              <div style={{ fontSize: 13, color: 'rgba(27,76,94,.55)', marginTop: 2 }}>
                Live performance · {data?.account?.name || CLIENT.name} · today
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#EAF7EC', color: '#2E7D44', border: '1px solid #CDEBD3', fontSize: 12.5, fontWeight: 600, padding: '8px 13px', borderRadius: 999 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3DBE5B' }} />
              {data ? `Live · as of ${istTime(data.asOf)}` : 'Live'}
            </span>
            <motion.button whileTap={{ scale: 0.96 }} onClick={load} disabled={refreshing}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: FOREST, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 10, cursor: refreshing ? 'default' : 'pointer', opacity: refreshing ? 0.7 : 1 }}>
              <motion.span animate={refreshing ? { rotate: 360 } : { rotate: 0 }} transition={refreshing ? { repeat: Infinity, duration: 0.8, ease: 'linear' } : {}} style={{ display: 'flex' }}>
                <IconRefresh size={15} />
              </motion.span>
              {refreshing ? 'Refreshing…' : 'Refresh now'}
            </motion.button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ padding: '80px 0', textAlign: 'center', color: 'rgba(27,76,94,.5)', fontSize: 14 }}>Loading live Meta data…</div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ background: '#FCEFEF', border: '1px solid #F3D6D6', borderRadius: 14, padding: '22px 24px', color: '#C0392B' }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Couldn’t load Meta data</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{error}</div>
            <div style={{ fontSize: 12.5, marginTop: 10, color: 'rgba(27,76,94,.55)' }}>
              If this says “Unauthorized” or a token error, confirm the <b>META_ADS_TOKEN</b> secret is set in Supabase with ads_read on the ad account.
            </div>
          </div>
        )}

        {/* Data */}
        {!loading && !error && t && (
          <>
            <div style={{
              display: 'grid', gap: 14,
              gridTemplateColumns: isMobile ? '1fr 1fr' : '1.55fr 1fr 1fr 1fr',
            }}>
              {/* Hero — leads */}
              <div style={{
                gridColumn: isMobile ? '1 / span 2' : 'auto',
                gridRow: isMobile ? 'auto' : '1 / span 2',
                background: FOREST, color: '#fff', borderRadius: 20, padding: '24px 26px', display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.8px', color: 'rgba(255,255,255,.75)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-accent-soft)' }} /> LEADS SO FAR · TODAY
                </div>
                <div style={{ fontSize: isMobile ? 64 : 88, fontWeight: 800, lineHeight: 1, marginTop: isMobile ? 18 : 'auto' }}>{num(t.leads)}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,.8)', marginTop: 14 }}>
                  {t.cpl != null ? <>at <b style={{ color: '#fff' }}>{inr(t.cpl)}</b> cost per lead</> : 'no leads yet today'}
                </div>
              </div>

              <Card span={isMobile ? 2 : 3} k="SPEND SO FAR" v={inr(t.spend, 2)} corner="today" big />
              <Card k="COST / LEAD" v={t.cpl != null ? inr(t.cpl) : '—'} />
              <Card k="CTR" v={pct(t.ctr)} />

              <Card k="COST / CLICK" v={inr(t.cpc)} corner="CPC" />
              <Card k="IMPRESSIONS TODAY" v={num(t.impressions)} corner={`reach ${num(t.reach)}`} />
              <Card k="CLICKS TODAY" v={num(t.linkClicks || t.clicks)} corner="link clicks" />
            </div>

            {/* Benchmark alert */}
            {t.cpl != null && data.benchmarkCpl != null && (
              <div style={{
                marginTop: 16, borderRadius: 12, padding: '13px 18px', fontSize: 13.5,
                background: aboveBench ? '#FCEFEF' : '#F0FAF1',
                border: `1px solid ${aboveBench ? '#F3D6D6' : '#D5EEDA'}`,
                color: aboveBench ? '#C0392B' : '#2E7D44',
              }}>
                <b>{inr(t.cpl)}</b> CPL so far is <b>{aboveBench ? 'above' : 'below'}</b> your {inr(data.benchmarkCpl)} benchmark
                {aboveBench ? ' — keep an eye on it.' : ' — nice work.'}
              </div>
            )}

            {/* Ads running */}
            <div style={{ margin: '24px 0 10px', fontSize: 13, fontWeight: 800, letterSpacing: '.3px', color: FOREST }}>
              Ads running &amp; performance · today
            </div>
            <div style={{ background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 16, overflow: 'hidden' }}>
              <Row head isMobile={isMobile} cells={['Ad', 'Status', 'Spend', 'Leads', 'CPL', 'CPC', 'CTR']} />
              {data.ads && data.ads.length ? data.ads.map((a, i) => (
                <Row key={i} isMobile={isMobile} cells={[
                  a.name || '(unnamed)',
                  <span key="s" style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#EAF7EC', color: '#2E7D44' }}>Active</span>,
                  inr(a.spend, 2),
                  num(a.leads),
                  a.cpl != null ? inr(a.cpl) : '—',
                  a.clicks ? inr(a.cpc) : '—',
                  pct(a.ctr),
                ]} />
              )) : (
                <div style={{ padding: '20px 18px', fontSize: 13, color: 'rgba(27,76,94,.5)' }}>No active ads delivering today.</div>
              )}
            </div>

            <div style={{ marginTop: 16, fontSize: 11.5, color: 'rgba(27,76,94,.4)' }}>
              Meta · {data.account?.name} ({data.account?.id}) · {data.account?.currency} · refreshes on open, on Refresh, and every 30 min · last updated {istTime(data.asOf)} · Performance only — no personal lead data shown
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ k, v, corner, big, span }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : 'auto', background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 18, padding: 20, position: 'relative' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.7px', color: 'rgba(27,76,94,.5)' }}>{k}</div>
      <div style={{ fontSize: big ? 40 : 34, fontWeight: 800, marginTop: 8, letterSpacing: '-.5px', color: FOREST }}>{v}</div>
      {corner && <div style={{ position: 'absolute', top: 20, right: 20, fontSize: 12, color: 'rgba(27,76,94,.4)' }}>{corner}</div>}
    </div>
  );
}

function Row({ cells, head, isMobile }) {
  const cols = isMobile ? '1.7fr .8fr .6fr' : '2.2fr .8fr .85fr .6fr .75fr .75fr .7fr';
  // On mobile show the outcome columns (Ad, Spend, Leads); drop Status/CPL/CTR.
  const shown = isMobile ? [cells[0], cells[2], cells[3]] : cells;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '13px 18px', alignItems: 'center',
      fontSize: head ? 11 : 13.5, fontWeight: head ? 700 : 500,
      letterSpacing: head ? '.5px' : 0, color: head ? 'rgba(27,76,94,.55)' : FOREST,
      background: head ? '#F6FAF8' : '#fff',
      borderTop: head ? 'none' : '1px solid rgba(27,76,94,.07)',
    }}>
      {shown.map((c, i) => (
        <div key={i} style={{ fontWeight: !head && i === 0 ? 600 : 'inherit', whiteSpace: i === 0 ? 'normal' : 'nowrap' }}>{c}</div>
      ))}
    </div>
  );
}

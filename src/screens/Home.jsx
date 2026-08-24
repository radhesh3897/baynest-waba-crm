import { useState, useEffect, Fragment } from 'react';
import { getHomeStatsLive, getQualificationStats } from '../liveData';
import { useIsMobile } from '../useIsMobile';
import { supabase } from '../supabaseClient';
import { CLIENT } from '../config/client.js';
import {
  IconInbox, IconInstagram, IconPeople, IconBuilding, IconZap,
  IconTemplate, IconSend, IconDb, IconCalendar,
} from '../icons';
import TemperatureTag from '../components/TemperatureTag';
import { leadChip, formatCr } from '../pipeline';

const fmt = n => Number(n || 0).toLocaleString('en-IN');
const CARD = { background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 14 };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

const FLOW_STATUS = {
  active: { bg: 'rgba(115,167,111,.18)', fg: '#3B6B45', dot: '#3B6B45' },
  draft: { bg: 'rgba(27,76,94,.08)', fg: 'rgba(27,76,94,.6)', dot: 'rgba(27,76,94,.4)' },
  paused: { bg: '#FFF1DC', fg: '#B6743A', dot: '#D9A93B' },
};

// Donut chart (no external lib) for the lead-quality split.
function Donut({ data, size = 156 }) {
  const stroke = 24;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0);
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(27,76,94,.07)" strokeWidth={stroke} />
        {total > 0 && data.filter(d => d.value > 0).map((d, i) => {
          const len = (d.value / total) * c;
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={stroke} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />;
          offset += len;
          return el;
        })}
      </g>
      <text x="50%" y="48%" textAnchor="middle" fontSize="28" fontWeight="900" fill="var(--brand-primary)">{total}</text>
      <text x="50%" y="62%" textAnchor="middle" fontSize="10" fontWeight="700" fill="rgba(27,76,94,.5)" letterSpacing="1">LEADS</text>
    </svg>
  );
}

function FunnelBar({ p, color }) {
  return (
    <div style={{ height: 7, borderRadius: 999, background: 'rgba(27,76,94,.07)', overflow: 'hidden', marginTop: 8 }}>
      <div style={{ width: `${p}%`, height: '100%', borderRadius: 999, background: color, transition: 'width .5s ease' }} />
    </div>
  );
}

// One Quick Links tile: soft icon chip, the number, then the label. Tapping it
// goes straight to the screen, so the dashboard is a launcher rather than a
// wall of figures nobody can read on a phone.
function QuickTile({ icon: Icon, tint, fg, count, label, onClick }) {
  return (
    <button onClick={onClick}
      style={{ background: '#fff', border: '1px solid rgba(27,76,94,.10)', borderRadius: 14, padding: '16px 8px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minHeight: 116 }}>
      <span style={{ width: 44, height: 44, borderRadius: 13, background: tint, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={22} />
      </span>
      <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand-primary)', lineHeight: 1 }}>{count}</span>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(27,76,94,.62)', textAlign: 'center', lineHeight: 1.25 }}>{label}</span>
    </button>
  );
}

// The two boards at a glance, plus what the deal side is actually worth.
// Rupees rather than a lead count, because after the call that is the number
// that matters and it is the whole point of splitting the pipelines.
function PipelineSummary({ stats, onNav }) {
  const boards = [
    { key: 'lead', label: 'Leads',  sub: 'before the call', n: stats.leadPipeline },
    { key: 'deal', label: 'Deals',  sub: 'after the call',  n: stats.dealPipeline },
  ];
  const tags = [
    { k: 'hot',  label: 'Hot',  n: stats.hotLeads,  dot: '#C7503B' },
    { k: 'warm', label: 'Warm', n: stats.warmLeads, dot: '#C08A45' },
    { k: 'cold', label: 'Cold', n: stats.coldLeads, dot: 'rgba(27,76,94,.4)' },
  ];
  return (
    <div style={{ ...CARD, padding: '15px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)' }}>PIPELINE</span>
        <button onClick={() => onNav?.('crm')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, color: 'var(--brand-muted)', padding: 0 }}>
          Open CRM →
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {boards.map(b => (
          <button key={b.key} onClick={() => onNav?.('crm')} style={{
            textAlign: 'left', border: '1px solid rgba(27,76,94,.10)', background: 'var(--brand-tint-soft, #F2F8F2)',
            borderRadius: 11, padding: '11px 12px', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--brand-primary)', letterSpacing: '-.02em', lineHeight: 1.05 }}>{fmt(b.n)}</div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--brand-primary)', marginTop: 3 }}>{b.label}</div>
            <div style={{ fontSize: 10.5, color: 'rgba(27,76,94,.45)' }}>{b.sub}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 11, borderTop: '1px solid rgba(27,76,94,.07)' }}>
        <span style={{ fontSize: 11.5, color: 'rgba(27,76,94,.5)', fontWeight: 600 }}>In play</span>
        <strong style={{ fontSize: 19, fontWeight: 900, color: 'var(--brand-primary)', letterSpacing: '-.01em' }}>{formatCr(stats.dealValueOpen, { dash: '₹0 Cr' })}</strong>
        {stats.dealValueBooked > 0 && (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#3B6B45' }}>· {formatCr(stats.dealValueBooked)} booked</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 9 }}>
        {tags.map(t => (
          <span key={t.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'rgba(27,76,94,.6)', fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.dot }} />
            {t.label} <strong style={{ color: 'var(--brand-primary)', fontWeight: 800 }}>{fmt(t.n)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Home({ onNav }) {
  const isMobile = useIsMobile();
  const [stats, setStats] = useState(null);
  const [qual, setQual] = useState(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState('');

  async function load() {
    const [s, q] = await Promise.all([getHomeStatsLive(), getQualificationStats()]);
    setStats(s); setQual(q); setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data?.user?.email || '')).catch(() => {});
  }, []);

  if (loading || !stats) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(27,76,94,.5)', fontSize: 14 }}>Loading dashboard…</div>;
  }

  const kpis = [
    { label: 'Total Leads', value: fmt(stats.leadsIn), sub: 'all time', accent: 'var(--brand-primary)' },
    { label: 'This Month', value: fmt(stats.leadsMonth), sub: 'new leads', accent: 'var(--brand-primary)' },
    { label: 'Conversations', value: fmt(stats.conversations), sub: 'on WhatsApp', accent: 'var(--brand-muted)' },
    { label: 'Messages Sent', value: fmt(stats.sent), sub: `${fmt(stats.received)} received`, accent: 'var(--brand-accent-soft)' },
  ];

  const funnel = [
    { label: 'Leads In', count: stats.leadsIn, conv: null, accent: 'rgba(27,76,94,.55)' },
    { label: 'Conversations', count: stats.conversations, conv: pct(stats.conversations, stats.leadsIn), accent: 'var(--brand-primary)' },
    { label: 'Qualified', count: stats.qualified, conv: pct(stats.qualified, stats.conversations || stats.leadsIn), accent: 'var(--brand-muted)' },
    { label: 'Booked', count: stats.won, conv: pct(stats.won, stats.qualified || stats.leadsIn), accent: 'var(--brand-accent-soft)' },
  ];

  // Quick Links tiles. Each one is a real count and a real destination; nothing
  // here is decorative.
  const tiles = [
    { key: 'crm',        icon: IconDb,        label: 'New Leads',   count: stats.newLeads,   tint: 'rgba(192,138,69,.16)',  fg: '#8A5E22' },
    { key: 'inbox',      icon: IconInbox,     label: 'Unread Chats',count: stats.unreadWa,   tint: 'rgba(115,167,111,.20)', fg: '#3B6B45' },
    { key: 'ig-inbox',   icon: IconInstagram, label: 'Instagram',   count: stats.unreadIg,   tint: 'rgba(199,80,59,.12)',   fg: '#9A3F2C' },
    { key: 'people',     icon: IconPeople,    label: 'Contacts',    count: stats.leadsIn,    tint: 'rgba(27,76,94,.10)',    fg: '#1B4C5E' },
    { key: 'properties', icon: IconBuilding,  label: 'Properties',  count: stats.properties, tint: 'rgba(62,107,120,.14)',  fg: '#2C6579' },
    { key: 'automation', icon: IconZap,       label: 'Active Flows',count: stats.activeFlows,tint: 'rgba(192,138,69,.16)',  fg: '#8A5E22' },
    { key: 'templates',  icon: IconTemplate,  label: 'Templates',   count: stats.templates,  tint: 'rgba(27,76,94,.10)',    fg: '#1B4C5E' },
    { key: 'campaigns',  icon: IconSend,      label: 'Campaigns',   count: stats.campaigns,  tint: 'rgba(115,167,111,.20)', fg: '#3B6B45' },
    { key: 'visits',     icon: IconCalendar,  label: 'Visits',      count: stats.visitsUpcoming, tint: 'rgba(199,80,59,.12)', fg: '#9A3F2C' },
  ];

  // Phone: a launcher, matching the layout Manish asked for. The funnel, donut
  // and message bars stay on desktop, where there is room to read them.
  if (isMobile) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 28px' }}>
        {/* Profile card */}
        <div style={{ ...CARD, padding: '14px 15px', display: 'flex', alignItems: 'center', gap: 13, marginBottom: 14 }}>
          <div style={{ width: 54, height: 54, borderRadius: 12, background: 'var(--brand-tint-soft)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <img src={CLIENT.logo} alt={CLIENT.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6, boxSizing: 'border-box' }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--brand-primary)', letterSpacing: '-.01em' }}>{CLIENT.name}</div>
            <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me || CLIENT.tagline}</div>
          </div>
          <button onClick={() => { setLoading(true); load(); }}
            style={{ background: 'transparent', border: '1px solid rgba(27,76,94,.16)', color: 'var(--brand-primary)', fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 999, cursor: 'pointer', flexShrink: 0 }}>
            Refresh
          </button>
        </div>

        <PipelineSummary stats={stats} onNav={onNav} />

        <h2 style={{ margin: '18px 2px 12px', fontSize: 18, fontWeight: 800, color: 'var(--brand-primary)', letterSpacing: '-.01em' }}>Quick Links</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
          {tiles.map(t => (
            <QuickTile key={t.key} icon={t.icon} tint={t.tint} fg={t.fg}
              count={fmt(t.count)} label={t.label} onClick={() => onNav?.(t.key)} />
          ))}
        </div>

        {/* Recent leads stay: the one list worth scanning on a phone. */}
        <h2 style={{ margin: '22px 2px 10px', fontSize: 18, fontWeight: 800, color: 'var(--brand-primary)', letterSpacing: '-.01em' }}>Recent Leads</h2>
        <div style={{ ...CARD, padding: '6px 15px 8px' }}>
          {stats.recent.length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.5)', padding: '12px 0' }}>No leads yet.</div>}
          {stats.recent.map(r => {
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid rgba(27,76,94,.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                  <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--brand-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, flexShrink: 0 }}>{(r.name || '?').charAt(0).toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--brand-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      <TemperatureTag temp={r.temperature} />
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(27,76,94,.45)' }}>{r.source}</div>
                  </div>
                </div>
                <span style={{ ...leadChip(r.status), flexShrink: 0, marginLeft: 8 }}>{r.status}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <header style={{ padding: isMobile ? '18px 16px 0' : '22px 30px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 23, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--brand-primary)' }}>Home</h1>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 8, background: 'rgba(115,167,111,.14)', border: '1px solid rgba(115,167,111,.32)', color: '#3B6B45', fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 999 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B6B45' }} />
            Live data
          </div>
        </div>
        <button onClick={() => { setLoading(true); load(); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid rgba(27,76,94,.16)', color: 'var(--brand-primary)', fontSize: 13, fontWeight: 700, padding: '9px 14px', borderRadius: 10, cursor: 'pointer', flexShrink: 0 }}>
          Refresh
        </button>
      </header>

      <div style={{ padding: isMobile ? '16px 16px 28px' : '20px 30px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        <PipelineSummary stats={stats} onNav={onNav} />

        {/* Quick Links. Same launcher as the phone, so the team learns one
            layout; desktop keeps the analytics below it rather than instead. */}
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--brand-primary)', marginBottom: 10 }}>Quick Links</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
            {tiles.map(t => (
              <QuickTile key={t.key} icon={t.icon} tint={t.tint} fg={t.fg}
                count={fmt(t.count)} label={t.label} onClick={() => onNav?.(t.key)} />
            ))}
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: isMobile ? 10 : 14 }}>
          {kpis.map(k => (
            <div key={k.label} style={{ ...CARD, padding: '18px 20px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)' }}>{k.label.toUpperCase()}</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: k.accent, letterSpacing: '-.02em', margin: '6px 0 2px' }}>{k.value}</div>
              <div style={{ fontSize: 11.5, color: 'rgba(27,76,94,.45)' }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Lead funnel */}
        <div style={{ ...CARD, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--brand-primary)' }}>Lead Funnel</div>
            <div style={{ fontSize: 11.5, color: 'rgba(27,76,94,.45)', fontWeight: 600 }}>Lead → Conversation → Qualified → Won</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'stretch', flexDirection: isMobile ? 'column' : 'row' }}>
            {funnel.map((stage, i) => (
              <Fragment key={stage.label}>
                {i > 0 && (
                  <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '6px 0' : '0 10px', flexShrink: 0, gap: 4 }}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ transform: isMobile ? 'rotate(90deg)' : 'none' }}><path d="M4 9H14M14 9L10 5M14 9L10 13" stroke="rgba(27,76,94,.25)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--brand-accent-soft)', whiteSpace: 'nowrap', background: 'rgba(192,138,69,.12)', padding: '2px 7px', borderRadius: 999 }}>{stage.conv}%</span>
                  </div>
                )}
                <div style={{ flex: 1, background: '#F6FAF6', border: '1px solid rgba(27,76,94,.08)', borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(27,76,94,.5)' }}>{stage.label.toUpperCase()}</div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: stage.accent, letterSpacing: '-.02em', lineHeight: 1.1, marginTop: 4 }}>{fmt(stage.count)}</div>
                  <div style={{ fontSize: 11, color: 'rgba(27,76,94,.4)', marginTop: 2 }}>{i === 0 ? 'total' : `${pct(stage.count, stats.leadsIn)}% of leads`}</div>
                </div>
              </Fragment>
            ))}
          </div>
        </div>

        {/* Lead Quality (from Tracking → Meta) */}
        {qual && (() => {
          const qualData = [
            { label: 'Qualified', value: qual.Qualified, color: '#3B6B45' },
            { label: 'Not Qualified', value: qual.NotQualified, color: '#B6743A' },
            { label: 'Junk', value: qual.Junk, color: '#C7503B' },
            { label: 'Intake', value: qual.Intake, color: 'var(--brand-primary)' },
            { label: 'Untagged', value: qual.Untagged, color: 'rgba(27,76,94,.16)' },
          ];
          return (
            <div style={{ ...CARD, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--brand-primary)' }}>Lead Quality</div>
                <div style={{ fontSize: 11.5, color: 'rgba(27,76,94,.45)', fontWeight: 600 }}>Tagged in Tracking · sent to Meta</div>
              </div>
              {qual.tagged === 0 ? (
                <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.5)' }}>No leads tagged yet. Qualify leads in the Tracking tab to see the split here.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: isMobile ? 18 : 28 }}>
                  <Donut data={qualData} />
                  <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {qualData.map(d => (
                      <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 11, height: 11, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: 'rgba(27,76,94,.75)', fontWeight: 600, flex: 1 }}>{d.label}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--brand-primary)' }}>{fmt(d.value)}</span>
                        <span style={{ fontSize: 11.5, color: 'rgba(27,76,94,.45)', width: 44, textAlign: 'right' }}>{pct(d.value, qual.total)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Row: Messages + Automation */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr', gap: 14 }}>
          {/* Messages */}
          <div style={{ ...CARD, padding: '20px 24px' }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--brand-primary)', marginBottom: 4 }}>Messages</div>
            <div style={{ fontSize: 11.5, color: 'rgba(27,76,94,.45)', marginBottom: 18 }}>WhatsApp traffic</div>
            {[
              { label: 'Sent', count: stats.sent, color: 'var(--brand-primary)' },
              { label: 'Received', count: stats.received, color: 'var(--brand-accent-soft)' },
            ].map(m => {
              const total = stats.sent + stats.received;
              return (
                <div key={m.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(27,76,94,.7)' }}>{m.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--brand-primary)' }}>{fmt(m.count)}</span>
                  </div>
                  <FunnelBar p={pct(m.count, total)} color={m.color} />
                </div>
              );
            })}
          </div>

          {/* Automation */}
          <div style={{ ...CARD, padding: '20px 24px' }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--brand-primary)', marginBottom: 16 }}>Automation</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Flow Runs', value: fmt(stats.flowRuns), accent: 'var(--brand-primary)' },
                { label: 'Active Flows', value: fmt(stats.activeFlows), accent: 'var(--brand-accent-soft)' },
                { label: 'Completed', value: fmt(stats.completedRuns), accent: 'var(--brand-muted)' },
              ].map(a => (
                <div key={a.label} style={{ background: '#F6FAF6', border: '1px solid rgba(27,76,94,.08)', borderRadius: 12, padding: '14px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', color: 'rgba(27,76,94,.5)' }}>{a.label.toUpperCase()}</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: a.accent, margin: '6px 0 0', letterSpacing: '-.01em' }}>{a.value}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: 'rgba(27,76,94,.45)', marginBottom: 8 }}>FLOWS</div>
            {stats.flows.length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.5)' }}>No flows yet. Build one in Automation.</div>}
            {stats.flows.map(f => {
              const st = FLOW_STATUS[f.status] || FLOW_STATUS.draft;
              return (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                  <span style={{ fontSize: 12.5, color: 'rgba(27,76,94,.75)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: st.fg, background: st.bg, padding: '3px 9px', borderRadius: 999, flexShrink: 0, marginLeft: 8 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.dot }} />{f.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent leads */}
        <div style={{ ...CARD, padding: '20px 24px' }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--brand-primary)', marginBottom: 14 }}>Recent Leads</div>
          {stats.recent.length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(27,76,94,.5)' }}>No leads yet.</div>}
          {stats.recent.map(r => {
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(27,76,94,.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--brand-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{(r.name || '?').charAt(0).toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(27,76,94,.45)' }}>{r.source}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <span style={{ fontSize: 11.5, color: 'rgba(27,76,94,.5)' }}>{r.received}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: st.fg, background: st.bg, padding: '3px 10px', borderRadius: 999 }}>{r.status}</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

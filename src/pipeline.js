// Baynest's E → S → O → V → D pipeline. The legacy database `pipeline`
// column stays compatible with existing workers; the UI uses these sections.
export const PIPELINES = [
  { key: 'E', label: 'Eligible', blurb: 'Qualification', color: '#8B5A20' },
  { key: 'S', label: 'Status', blurb: 'Contact outcome', color: '#147D68' },
  { key: 'O', label: 'Options', blurb: 'Properties shared', color: '#B7592C' },
  { key: 'V', label: 'Visit', blurb: 'Schedule and visit', color: '#5747B8' },
  { key: 'D', label: 'Deal', blurb: 'Outcome', color: '#4B4B59' },
];
export const DEFAULT_SECTIONS = {
  E: ['New', 'Qualified', 'Not qualified'],
  S: ['Contacted', "Didn't pick up", 'Call back later', 'Not interested'],
  O: ['Options sent'],
  V: ['Schedule visit', 'Visit scheduled', 'Visited'],
  D: ['Negotiation', 'Lost', 'Deal closed'],
};
let activeSections = DEFAULT_SECTIONS;
export function usePipelineSections(sections) {
  activeSections = sections || DEFAULT_SECTIONS;
  return activeSections;
}
export const STAGE_ALIASES = {
  'Not Qualified': 'Not qualified', NotQualified: 'Not qualified', Junk: 'Not qualified',
  'Didn’t Pick Call': "Didn't pick up", "Didn't Pick Call": "Didn't pick up", Attempted: "Didn't pick up",
  'Follow Up': 'Call back later', 'Looking to schedule visit': 'Schedule visit',
  Hot: 'Call back later', Warm: 'Contacted', Cool: 'New',
  'Visit Scheduled': 'Visit scheduled', Visits: 'Visit scheduled',
  'Offer Made': 'Negotiation', Booked: 'Deal closed', Won: 'Deal closed', Closed: 'Deal closed',
};
export const canonicalStage = stage => STAGE_ALIASES[stage] || stage || 'New';
export const stageLabel = stage => canonicalStage(stage) === 'New' ? 'New / awaiting qualification' : canonicalStage(stage);
export const DEAD_STAGES = ['Not qualified', 'Not interested', 'Lost'];
export const WON_STAGES = ['Deal closed'];
export const ALL_STAGES = Object.values(DEFAULT_SECTIONS).flat();
// Retained only for legacy data-layer compatibility, never two UI boards.
export const LEAD_STAGES = [...DEFAULT_SECTIONS.E, ...DEFAULT_SECTIONS.S, ...DEFAULT_SECTIONS.O];
export const DEAL_STAGES = [...DEFAULT_SECTIONS.V, ...DEFAULT_SECTIONS.D];
export const TEMPERATURES = ['hot', 'warm', 'cold'];
export function pipelineOf(stage, sections = activeSections) {
  const value = canonicalStage(stage);
  const config = sections && !Array.isArray(sections) ? sections : DEFAULT_SECTIONS;
  return PIPELINES.find(p => (config[p.key] || DEFAULT_SECTIONS[p.key]).includes(value))?.key || 'E';
}
export function stagesFor(key, sections = DEFAULT_SECTIONS) { return sections[key] || DEFAULT_SECTIONS[key] || []; }
export function sectionStyle(stage, sections = activeSections) {
  const section = PIPELINES.find(p => p.key === pipelineOf(stage, sections));
  return { label: `${section.key} · ${section.label}`, color: section.color };
}
export const STAGE_CHIP = Object.fromEntries(ALL_STAGES.map(stage => {
  const color = sectionStyle(stage).color;
  return [stage, { bg: `${color}18`, fg: color }];
}));
export function leadChip(stage) {
  const c = STAGE_CHIP[canonicalStage(stage)] || { bg: 'rgba(27,76,94,.07)', fg: 'var(--brand-primary)' };
  return { display: 'inline-flex', alignItems: 'center', gap: 5, background: c.bg, color: c.fg,
    fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap' };
}

// ── Money ────────────────────────────────────────────────────────────────────
// Everything is held in crore because that is how the market quotes and how the
// ad forms ask. Trim a trailing .0 so ₹18 Cr does not read as ₹18.0 Cr.
export function formatCr(n, { dash = '—' } = {}) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return dash;
  const s = v >= 100 || Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, '');
  return `₹${s} Cr`;
}

// A column or board total. One value per lead, never a sum of their tagged
// properties: a buyer chasing five ₹18 Cr flats is one ₹18 Cr deal.
export function sumDealValue(leads) {
  return (leads || []).reduce((t, l) => t + (Number(l.deal_value_cr) || 0), 0);
}

// Value still genuinely in play — Booked has landed, Lost/Junk has not.
export function openDealValue(leads) {
  return sumDealValue((leads || []).filter(l =>
    !DEAD_STAGES.includes(l.lead_status) && !WON_STAGES.includes(l.lead_status)));
}

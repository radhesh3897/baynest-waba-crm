// ── The two pipelines ────────────────────────────────────────────────────────
// Everything before the advisor gets the lead on a call lives in the Lead
// pipeline. The moment a call has happened it becomes a Deal, with a rupee
// value attached. These lists mirror app_settings.pipeline_stages /
// deal_stages; they are the fallback when settings have not loaded yet, and
// the DB trigger uses the same names to decide which board a contact sits on.

export const LEAD_STAGES = ['New', 'Attempted', 'Contacted', 'Follow Up', 'Qualified', 'Junk'];
export const DEAL_STAGES = ['Visit Scheduled', 'Visited', 'Offer Made', 'Negotiation', 'Booked', 'Lost'];

export const PIPELINES = [
  { key: 'lead', label: 'Leads', blurb: 'Before the call' },
  { key: 'deal', label: 'Deals', blurb: 'After the call' },
];

// Terminal stages: still on the board, but out of the forecast and out of the
// "needs chasing" counts.
export const DEAD_STAGES = ['Junk', 'Lost'];
export const WON_STAGES  = ['Booked'];

export function pipelineOf(stage, dealStages = DEAL_STAGES) {
  return (dealStages || DEAL_STAGES).includes(stage) ? 'deal' : 'lead';
}

export function stagesFor(pipeline, leadStages = LEAD_STAGES, dealStages = DEAL_STAGES) {
  return pipeline === 'deal' ? (dealStages || DEAL_STAGES) : (leadStages || LEAD_STAGES);
}

// ── Temperature ──────────────────────────────────────────────────────────────
// Computed in Postgres from budget + timeline (see lead_temperature()), so the
// rule lives in exactly one place and the board can sort on it. Repeated here
// only as the label/colour lookup and for the "why" text in the editor.

export const TEMPERATURES = ['hot', 'warm', 'cold'];

export const TEMP_STYLE = {
  hot:  { label: 'Hot',  bg: 'rgba(199,80,59,.13)',  fg: '#B4432F', dot: '#C7503B' },
  warm: { label: 'Warm', bg: 'rgba(192,138,69,.20)', fg: '#8A5E22', dot: '#C08A45' },
  cold: { label: 'Cold', bg: 'rgba(27,76,94,.08)',   fg: 'rgba(27,76,94,.6)', dot: 'rgba(27,76,94,.4)' },
};

export function tempStyle(t) {
  return TEMP_STYLE[t] || TEMP_STYLE.cold;
}

export const TEMP_RULE = {
  hot:  'Buying within 3 months and budget ₹5 Cr or above.',
  warm: 'Has a budget and a timeline, but not both in the hot band.',
  cold: 'Just exploring, under ₹3 Cr, or has not told us yet.',
};

// ── Stage chips ──────────────────────────────────────────────────────────────
// Both boards run cool-to-committed: faint at the start, solid forest by
// Negotiation, green once won, greyed out once dead. Lived in three separate
// copies before the pipeline split and had already drifted out of sync, so it
// is defined once here and imported everywhere a stage is drawn.
export const STAGE_CHIP = {
  New:               { bg: 'rgba(27,76,94,.07)',   fg: 'var(--brand-primary)' },
  Attempted:         { bg: 'rgba(27,76,94,.10)',   fg: 'var(--brand-primary)' },
  Contacted:         { bg: 'rgba(27,76,94,.13)',   fg: 'var(--brand-primary)' },
  'Follow Up':       { bg: 'rgba(192,138,69,.18)', fg: '#8A5E22' },
  Qualified:         { bg: 'rgba(115,167,111,.22)', fg: '#3B6B45' },
  Junk:              { bg: 'rgba(27,76,94,.05)',   fg: 'rgba(27,76,94,.45)' },
  'Visit Scheduled': { bg: 'rgba(192,138,69,.14)', fg: '#8A5E22' },
  Visited:           { bg: 'rgba(192,138,69,.22)', fg: '#7A4E18' },
  'Offer Made':      { bg: 'rgba(192,138,69,.30)', fg: '#6E440F' },
  Negotiation:       { bg: 'var(--brand-primary)', fg: 'var(--app-bg)' },
  Booked:            { bg: 'rgba(115,167,111,.28)', fg: '#3B6B45' },
  Lost:              { bg: 'rgba(27,76,94,.05)',   fg: 'rgba(27,76,94,.45)' },
};

export function leadChip(stage) {
  const c = STAGE_CHIP[stage] || { bg: 'rgba(27,76,94,.07)', fg: 'var(--brand-primary)' };
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: c.bg, color: c.fg, fontSize: 11.5, fontWeight: 700,
    padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap',
  };
}

// ── Money ────────────────────────────────────────────────────────────────────
// Everything is held in crore because that is how the market quotes and how the
// ad forms ask. Trim a trailing .0 so ₹18 Cr does not read as ₹18.0 Cr.
export function formatCr(n, { dash = '—' } = {}) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return dash;
  const s = v >= 100 ? v.toFixed(0) : v.toFixed(v % 1 === 0 ? 0 : 2).replace(/\.?0+$/, '');
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

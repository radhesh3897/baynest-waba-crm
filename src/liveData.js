// Supabase-backed data layer for the live Inbox.
// Maps raw DB rows into the shape the UI components already expect.
import { supabase } from './supabaseClient';
import { LEAD_STAGES, DEAL_STAGES, TEMPERATURES } from './pipeline';

const AVATAR_COLORS = ['#356E63', '#2E7BA8', '#7A5BB9', '#B6743A', '#C7503B', '#3B6B45', '#15514B', '#4A6EA8'];

// Deterministic avatar colour from a stable key (wa_id), so a contact keeps the same colour.
function colorFor(key = '') {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function relativeTime(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'a few seconds ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? '1 minute ago' : `${m} minutes ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'a day ago';
  if (d < 7) return `${d} days ago`;
  return new Date(isoString).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// Exact local timestamp (IST) — e.g. "26 Jun 2026, 11:04 PM"
function exactTime(isoString) {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

function msgTime(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isYesterday = new Date(now - 86400000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (isToday) return time;
  if (isYesterday) return `Yesterday ${time}`;
  return d.toLocaleDateString('en-IN', { weekday: 'short' }) + ' ' + time;
}

function mapContact(c) {
  if (!c) return null;
  // An Instagram-only contact has no phone number, so fall back to the handle.
  const name = c.profile_name || c.wa_id || (c.ig_username ? `@${c.ig_username}` : '') || 'Unknown';
  const parts = name.trim().split(' ');
  return {
    id: c.id,
    wa_id: c.wa_id,
    ig_id: c.ig_id || null,
    ig_username: c.ig_username || null,
    profile_name: name,
    firstName: c.first_name || parts[0] || '',
    lastName: c.last_name || parts.slice(1).join(' ') || '',
    company: c.company || '-',
    jobTitle: c.job_title || '-',
    email: c.email || '',
    phone: c.wa_id || '',
    lead_score: c.lead_score ?? 0,
    lead_status: c.lead_status || 'New',
    pipeline: c.pipeline || 'lead',
    temperature: c.temperature || 'cold',
    temperature_override: c.temperature_override || null,
    deal_value_cr: c.deal_value_cr ?? null,
    deal_value_is_manual: !!c.deal_value_is_manual,
    source: c.source || '-',
    attributes: c.attributes || {},
    color: colorFor(c.wa_id || c.ig_id || c.id),
  };
}

// ─── Conversations ────────────────────────────────────────────────────────────
// `channel` scopes the list to one inbox ('whatsapp' | 'instagram'); omit it to
// get every thread.
export async function getConversationsLive(channel) {
  let query = supabase
    .from('conversations')
    .select('id, contact_id, channel, last_message_at, window_expires_at, unread_count, status, contacts(*)')
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (channel) query = query.eq('channel', channel);
  const { data, error } = await query;

  if (error) {
    console.error('getConversationsLive', error);
    return [];
  }

  // Fetch the latest message body per conversation for the list preview, and in
  // the same pass work out when each contact was last on WhatsApp.
  const ids = data.map(c => c.id);
  let previews = {};
  let lastRead = {};
  if (ids.length) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('conversation_id, body, created_at, direction, status, updated_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false });
    for (const m of msgs || []) {
      if (!previews[m.conversation_id]) previews[m.conversation_id] = m.body || '';
      // A read receipt on one of ours means they actually had the chat open at
      // that moment, which is the strongest presence signal we can get.
      if (m.direction === 'out' && m.status === 'read' && m.updated_at) {
        const seen = lastRead[m.conversation_id];
        if (!seen || m.updated_at > seen) lastRead[m.conversation_id] = m.updated_at;
      }
    }
  }

  return data.map(conv => ({
    id: conv.id,
    contact_id: conv.contact_id,
    channel: conv.channel || 'whatsapp',
    contact: mapContact(conv.contacts),
    last_message_at: conv.last_message_at,
    windowExpiresAt: conv.window_expires_at,
    windowOpen: conv.window_expires_at ? new Date(conv.window_expires_at) > new Date() : false,
    unread_count: conv.unread_count || 0,
    status: conv.status || 'open',
    preview: previews[conv.id] || '',
    relativeTime: relativeTime(conv.last_message_at),
    lastSeen: laterOf(conv.contacts?.last_inbound_at, lastRead[conv.id]),
  }));
}

// WhatsApp's Cloud API reports no presence at all: there is no last-seen or
// online endpoint, by design. So we derive it from the only two moments we can
// actually prove they had WhatsApp open — a message they sent us, or a read
// receipt on one of ours. Null when we have neither (e.g. read receipts off and
// they have never replied).
function laterOf(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

// Mark a conversation read — clears the unread dot/badge once it's opened.
export async function markConversationRead(convId) {
  const { error } = await supabase.from('conversations').update({ unread_count: 0 }).eq('id', convId);
  return !error;
}

// Open or close a conversation (status pill / filter).
export async function markConversationStatus(convId, status) {
  const { error } = await supabase.from('conversations').update({ status }).eq('id', convId);
  return !error;
}

// Contact ids that were enrolled in a flow AND have replied (for the "Flows" filter).
export async function getFlowRepliedContactIds() {
  const { data, error } = await supabase.from('flow_runs').select('contact_id, last_reply').not('last_reply', 'is', null);
  if (error) { console.error('getFlowRepliedContactIds', error); return []; }
  return [...new Set((data || []).map(r => r.contact_id))];
}

// ─── Messages ─────────────────────────────────────────────────────────────────
export async function getMessagesLive(convId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('getMessagesLive', error);
    return [];
  }
  return data.map(m => ({
    id: m.id,
    wa_message_id: m.wa_message_id,
    direction: m.direction,
    type: m.type,
    body: m.body,
    template_name: m.template_name,
    payload: m.payload,
    // Only ever surface https media URLs — blocks javascript:/data: URIs from
    // being rendered into <a href>/<img src> (stored-XSS guard).
    media_url: /^https:\/\//i.test(m.media_url || '') ? m.media_url : null,
    media_filename: m.media_filename,
    status: m.status,
    error: m.error,
    sent_by: m.sent_by,
    created_at: m.created_at,
    timeStr: msgTime(m.created_at),
  }));
}

// ─── Send (via the send-message Edge Function — enforces 24h window server-side) ─
export async function sendMessageLive(wa_id, payload) {
  const { type, body, template_name, language, components } = payload;
  const reqBody = type === 'template'
    ? { wa_id, type: 'template', template: { name: template_name, language: language || 'en', components: components || [] } }
    : { wa_id, type: 'text', text: body };

  const { data, error } = await supabase.functions.invoke('send-message', { body: reqBody });

  if (error) {
    // Edge function returned non-2xx; try to surface its JSON error.
    let detail = error.message;
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) detail = ctx.error;
    } catch { /* ignore */ }
    return { ok: false, error: detail };
  }
  return { ok: true, message: data?.message };
}

// Send an Instagram DM. Instagram has no templates, so once the 24h window
// closes the only route left is the human-agent tag (7 days, human-typed only).
export async function sendInstagramMessageLive(contactId, text, { humanAgent = false } = {}) {
  const { data, error } = await supabase.functions.invoke('instagram-send', {
    body: { contact_id: contactId, text, human_agent: humanAgent },
  });
  if (error) {
    let detail = error.message;
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) detail = ctx.error;
    } catch { /* ignore */ }
    return { ok: false, error: detail };
  }
  if (data && data.ok === false) return { ok: false, error: data.error };
  return { ok: true, message_id: data?.message_id };
}

// Upload a file to public storage, then send it to the contact via Meta (by link).
export async function sendMediaLive(wa_id, file, caption = '') {
  try {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const path = `out/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('wa-media').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (upErr) return { ok: false, error: 'Upload failed: ' + upErr.message };
    const { data: pub } = supabase.storage.from('wa-media').getPublicUrl(path);
    const media_type = (file.type || '').startsWith('image/') ? 'image' : (file.type || '').startsWith('video/') ? 'video' : 'document';
    const { data, error } = await supabase.functions.invoke('send-media', {
      body: { wa_id, media_url: pub.publicUrl, media_type, caption, filename: file.name },
    });
    if (error) {
      let detail = error.message;
      try { const ctx = await error.context?.json?.(); if (ctx?.error) detail = ctx.error; } catch { /* ignore */ }
      return { ok: false, error: detail };
    }
    return { ok: true, message: data?.message };
  } catch (e) {
    return { ok: false, error: e.message || 'Failed to send attachment' };
  }
}

// ─── Realtime ─────────────────────────────────────────────────────────────────
// Subscribe to all message inserts/updates. callback receives the raw new row.
export function subscribeMessages(callback) {
  const channel = supabase
    .channel('messages-stream')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, payload => {
      callback(payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, payload => {
      callback({ ...payload, _conversation: true });
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

// ─── Templates ────────────────────────────────────────────────────────────────
export async function getTemplatesLive() {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .order('name', { ascending: true });
  if (error) {
    console.error('getTemplatesLive', error);
    return [];
  }
  return data;
}

// ── Template cache (so the Automation flow nodes can read templates synchronously) ──
let _tplCache = [];
export async function loadTemplatesCache() {
  const t = await getTemplatesLive();
  _tplCache = (t || []).map(x => ({ ...x, buttons: Array.isArray(x.buttons) ? x.buttons : [] }));
  return _tplCache;
}
export function getCachedTemplates() { return _tplCache; }
export function getCachedTemplateButtons(name) {
  const t = _tplCache.find(x => x.name === name);
  return t && Array.isArray(t.buttons) ? t.buttons : [];
}

// Creates a new WhatsApp template on Meta (status PENDING until reviewed).
// payload: { name, language, category, components }
export async function createTemplateLive(payload) {
  const { data, error } = await supabase.functions.invoke('create-template', { body: payload });
  if (error) {
    let detail = error.message;
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) detail = ctx.error;
    } catch { /* ignore */ }
    return { ok: false, error: detail };
  }
  return { ok: true, id: data?.id, status: data?.status };
}

// Upload a sample media file and get a Meta header_handle (for media-header /
// carousel templates). Returns { ok, handle, url }.
export async function getMediaHandle(file) {
  try {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const path = `tpl/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('wa-media').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (upErr) return { ok: false, error: 'Upload failed: ' + upErr.message };
    const { data: pub } = supabase.storage.from('wa-media').getPublicUrl(path);
    const { data, error } = await supabase.functions.invoke('get-media-handle', {
      body: { media_url: pub.publicUrl, file_type: file.type, file_name: file.name },
    });
    if (error) {
      let detail = error.message;
      try { const ctx = await error.context?.json?.(); if (ctx?.error) detail = ctx.error; } catch { /* ignore */ }
      return { ok: false, error: detail };
    }
    return { ok: true, handle: data.handle, url: pub.publicUrl };
  } catch (e) {
    return { ok: false, error: e.message || 'Failed to upload media' };
  }
}

// Send a test of a flow's template to a number (variables filled from that contact).
export async function sendTemplateTest(wa_id, template_name, variables) {
  const { data, error } = await supabase.functions.invoke('send-template-test', { body: { wa_id, template_name, variables } });
  if (error) {
    let detail = error.message;
    try { const ctx = await error.context?.json?.(); if (ctx?.error) detail = ctx.error; } catch { /* ignore */ }
    return { ok: false, error: detail };
  }
  return { ok: true, preview: data?.preview, sent_to: data?.sent_to };
}

// Delete a template (on Meta + locally).
export async function deleteTemplateLive(name) {
  const { data, error } = await supabase.functions.invoke('delete-template', { body: { name } });
  if (error) {
    let detail = error.message;
    try { const ctx = await error.context?.json?.(); if (ctx?.error) detail = ctx.error; } catch { /* ignore */ }
    return { ok: false, error: detail };
  }
  return { ok: data?.ok };
}

// Pulls the latest templates from Meta into the DB, then returns the count.
export async function syncTemplatesFromMeta() {
  const { data, error } = await supabase.functions.invoke('sync-templates', { body: {} });
  if (error) {
    let detail = error.message;
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) detail = ctx.error;
    } catch { /* ignore */ }
    return { ok: false, error: detail };
  }
  return { ok: true, synced: data?.synced ?? 0 };
}

// ─── Meta Ads dashboard ──────────────────────────────────────────────────────────────────────────────────────────────────
// Live, on-demand pull from the read-only meta-ads-insights edge function.
export async function getMetaAdsInsights() {
  // invoke() has no timeout of its own, so a stalled call leaves the dashboard
  // spinning with nothing to report. Race it and surface a real message instead.
  const timeout = new Promise(resolve =>
    setTimeout(() => resolve({ data: null, error: { message: 'Meta took too long to respond. Try Refresh.' } }), 25000));
  const { data, error } = await Promise.race([
    supabase.functions.invoke('meta-ads-insights', { body: {} }),
    timeout,
  ]);
  if (error) {
    // Report enough to identify the cause from the screen alone. "Failed to
    // load" on its own says nothing; a 401 means the session, a 5xx means Meta.
    let detail = error.message;
    let status = error.context?.status ?? null;
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) detail = ctx.error;
    } catch { /* body was not json */ }
    const { data: s } = await supabase.auth.getSession().catch(() => ({ data: null }));
    return {
      ok: false,
      error: detail,
      status,
      signedIn: !!s?.session,
      diag: `status ${status ?? 'n/a'} · session ${s?.session ? 'present' : 'missing'}`,
    };
  }
  return data;
}

// Upload an image (template header) to the public wa-media bucket → returns a URL.
export async function uploadHeaderImage(file) {
  if (!file) return { ok: false, error: 'No file selected.' };
  if (!file.type?.startsWith('image/')) return { ok: false, error: 'Please choose an image file.' };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: 'Image must be under 5 MB.' };
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `headers/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('wa-media').upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { ok: false, error: error.message };
  const { data } = supabase.storage.from('wa-media').getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

// ─── Lead Tracking / Conversions API ────────────────────────────────────────────
export const QUALIFICATIONS = ['Intake', 'Qualified', 'NotQualified', 'Junk'];
export const QUALIFICATION_LABELS = { Intake: 'Intake', Qualified: 'Qualified', NotQualified: 'Not Qualified', Junk: 'Junk' };

// All leads for the Tracking panel: form/manual contacts + CSV-imported rows.
export async function getTrackingLeads() {
  const [{ data: contacts }, { data: csv }] = await Promise.all([
    supabase.from('contacts')
      .select('id, profile_name, wa_id, email, attributes, qualification, qualified_at, capi_status, created_at, source')
      .order('created_at', { ascending: false }),
    supabase.from('tracking_leads').select('*').order('created_at', { ascending: false }),
  ]);
  const rows = [];
  for (const c of contacts || []) rows.push({
    key: 'contact:' + c.id, source: 'contact', id: c.id,
    name: c.profile_name || c.wa_id, phone: c.wa_id, email: c.email,
    leadId: (c.attributes && c.attributes.meta_lead_id) || '',
    attributes: c.attributes || {}, qualification: c.qualification, capiStatus: c.capi_status,
    date: c.created_at, origin: c.source || 'Meta Lead Ads',
  });
  for (const t of csv || []) rows.push({
    key: 'tracking:' + t.id, source: 'tracking', id: t.id,
    name: t.name || t.lead_id || '(no name)', phone: t.phone, email: t.email,
    leadId: t.lead_id || '', attributes: t.attributes || {}, qualification: t.qualification, capiStatus: t.capi_status,
    date: t.upload_date || t.created_at, origin: 'CSV upload',
  });
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  return rows;
}

// Set a lead's qualification and fire the CAPI event to Meta.
export async function setLeadQualification(source, id, qualification) {
  const { data, error } = await supabase.functions.invoke('capi-lead-event', { body: { source, id, qualification } });
  if (error) {
    let detail = error.message;
    try { const ctx = await error.context?.json?.(); if (ctx?.error) detail = ctx.error; } catch { /* ignore */ }
    return { ok: false, error: detail };
  }
  return data;
}

// Counts by qualification (for the Home lead-quality chart).
export async function getQualificationStats() {
  const [{ data: c }, { data: t }] = await Promise.all([
    supabase.from('contacts').select('qualification'),
    supabase.from('tracking_leads').select('qualification'),
  ]);
  const counts = { Intake: 0, Qualified: 0, NotQualified: 0, Junk: 0, Untagged: 0 };
  const tally = (arr) => (arr || []).forEach((r) => {
    if (r.qualification && counts[r.qualification] != null) counts[r.qualification]++;
    else counts.Untagged++;
  });
  tally(c); tally(t);
  counts.total = counts.Intake + counts.Qualified + counts.NotQualified + counts.Junk + counts.Untagged;
  counts.tagged = counts.total - counts.Untagged;
  return counts;
}

// Bulk-import CSV rows of lead-gen ids into tracking_leads.
export async function uploadTrackingLeads(rows) {
  if (!rows.length) return { ok: false, error: 'No rows to import.' };
  const { data, error } = await supabase.from('tracking_leads')
    .upsert(rows, { onConflict: 'lead_id', ignoreDuplicates: false })
    .select('id');
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: data?.length ?? rows.length };
}

// Remove a lead from Tracking (deletes the contact + its data, or the CSV row).
export async function removeTrackingLead(source, id) {
  if (source === 'contact') return deletePersonLive(id);
  const { error } = await supabase.from('tracking_leads').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ─── Campaigns (bulk template sends) ────────────────────────────────────────────
const firstNameOf = (name = '') => (name || '').trim().split(/\s+/)[0] || '';

// Count {{n}} body variables in a template body.
export function templateVars(body = '') {
  const set = new Set((body.match(/\{\{\s*\d+\s*\}\}/g) || []));
  return set.size;
}

// Contacts matching campaign filters (for preview + recipient build).
async function resolveAudience(filters) {
  let q = supabase.from('contacts').select('id, wa_id, profile_name');
  if (filters.date_from) q = q.gte('created_at', filters.date_from);
  if (filters.date_to) q = q.lte('created_at', filters.date_to + 'T23:59:59');
  if (filters.qualifications?.length) q = q.in('qualification', filters.qualifications);
  if (filters.lead_statuses?.length) q = q.in('lead_status', filters.lead_statuses);
  if (filters.pipelines?.length) q = q.in('pipeline', filters.pipelines);
  if (filters.temperatures?.length) q = q.in('temperature', filters.temperatures);
  // Lead-age segment: 'old' = the historical/imported list; 'new' = everything else.
  if (filters.segment === 'old') q = q.eq('attributes->>imported', 'true');
  else if (filters.segment === 'new') q = q.or('attributes->>imported.is.null,attributes->>imported.neq.true');
  const { data, error } = await q;
  if (error) { console.error('resolveAudience', error); return []; }
  return data || [];
}

export async function previewAudience(filters) {
  const rows = await resolveAudience(filters);
  return rows.length;
}

// Create + launch a campaign: resolve audience, insert recipients, set sending.
export async function createCampaign({ name, template_name, template_language, variables, filters, header_image, maxRetries = 3 }) {
  const audience = await resolveAudience(filters);
  if (audience.length === 0) return { ok: false, error: 'No people match those filters.' };

  const { data: camp, error: ce } = await supabase.from('campaigns')
    .insert({ name, template_name, template_language: template_language || 'en', variables, filters, header_image: header_image || null, status: 'sending' })
    .select('id').single();
  if (ce) return { ok: false, error: ce.message };

  const recipients = audience.map((c) => ({
    campaign_id: camp.id, contact_id: c.id, wa_id: c.wa_id,
    first_name: firstNameOf(c.profile_name), status: 'queued',
    max_attempts: Math.max(1, (Number(maxRetries) || 0) + 1), next_attempt_at: new Date().toISOString(),
  }));
  for (let i = 0; i < recipients.length; i += 500) {
    const { error } = await supabase.from('campaign_recipients').insert(recipients.slice(i, i + 500));
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, id: camp.id, count: recipients.length };
}

// True per-recipient status uses the message's delivery status (updated by the
// webhook), not just the send-time result — so 131049-type failures count.
async function msgStatusMap(recs) {
  const ids = recs.map(r => r.wa_message_id).filter(Boolean);
  const map = {};
  for (let i = 0; i < ids.length; i += 300) {
    const { data: msgs } = await supabase.from('messages').select('wa_message_id, status, error').in('wa_message_id', ids.slice(i, i + 300));
    (msgs || []).forEach(m => { map[m.wa_message_id] = { status: m.status, error: m.error }; });
  }
  return map;
}
// Meta stores message errors as an array of { code, title, message, error_data }.
// Recipient.error is a plain string. Normalise either into one readable line.
function formatError(err) {
  if (!err) return null;
  if (typeof err === 'string') return err;
  const e = Array.isArray(err) ? err[0] : err;
  if (!e || typeof e !== 'object') return String(err);
  const text = e.error_data?.details || e.title || e.message || 'delivery failed';
  return e.code ? `${text} (#${e.code})` : text;
}
function classifyRecipient(r, map) {
  const dl = r.wa_message_id ? (map[r.wa_message_id]?.status || r.status) : r.status;
  if (r.status === 'failed' || dl === 'failed') return 'failed';
  if (r.status === 'sent' || ['sent', 'delivered', 'read'].includes(dl)) return 'sent';
  return 'pending'; // queued | retry
}
function tallyStatuses(recs, map) {
  const s = { total: recs.length, sent: 0, queued: 0, failed: 0, retrying: 0, retryAttempts: 0, recovered: 0, gaveUp: 0, nextRetryAt: null };
  recs.forEach(r => {
    const st = classifyRecipient(r, map);
    if (st === 'failed') s.failed++; else if (st === 'sent') s.sent++; else s.queued++;
    // Every attempt beyond the first is a retry that actually fired.
    if ((r.attempts || 0) > 1) s.retryAttempts += (r.attempts - 1);
    // Retry outcomes: succeeded after a retry, or still failed after retrying.
    if ((r.attempts || 0) > 1 && st === 'sent') s.recovered++;
    if ((r.attempts || 0) > 1 && st === 'failed') s.gaveUp++;
    if (r.status === 'retry') {
      s.retrying++;
      if (r.next_attempt_at && (!s.nextRetryAt || r.next_attempt_at < s.nextRetryAt)) s.nextRetryAt = r.next_attempt_at;
    }
  });
  return s;
}

export async function getCampaigns() {
  const { data: camps } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
  const out = [];
  for (const c of camps || []) {
    const { data: recs } = await supabase.from('campaign_recipients').select('status, wa_message_id, attempts, next_attempt_at').eq('campaign_id', c.id);
    const map = await msgStatusMap(recs || []);
    out.push({ ...c, ...tallyStatuses(recs || [], map) });
  }
  return out;
}

export async function getCampaign(id) {
  const { data: c } = await supabase.from('campaigns').select('*').eq('id', id).maybeSingle();
  if (!c) return null;
  const { data: recs } = await supabase.from('campaign_recipients')
    .select('id, wa_id, first_name, status, attempts, max_attempts, next_attempt_at, last_attempt_at, error, wa_message_id, contact_id, attempt_log')
    .eq('campaign_id', id).order('created_at', { ascending: true });
  const map = await msgStatusMap(recs || []);
  const rows = (recs || []).map(r => {
    const st = classifyRecipient(r, map);
    const msgErr = r.wa_message_id ? map[r.wa_message_id]?.error : null;
    return { ...r, delivery: st === 'failed' ? 'failed' : (r.wa_message_id ? (map[r.wa_message_id]?.status || r.status) : r.status), error: formatError(r.error || msgErr) };
  });
  return { ...c, ...tallyStatuses(recs || [], map), recipients: rows };
}

export async function pauseCampaign(id, pause = true) {
  const { error } = await supabase.from('campaigns').update({ status: pause ? 'paused' : 'sending' }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Re-queue every failed recipient (send-time OR delivery failure) for up to
// `maxRetries` more attempts over 24h, and re-open the campaign.
// NOTE: we keep `attempts` climbing (never reset it) and raise `max_attempts`
// to attempts + maxRetries, so the retry counter stays meaningful and the
// recovered/gave-up outcome logic (which keys off attempts > 1) works. We also
// clear wa_message_id so a re-queued recipient shows as "retrying" (not the old
// failed message) while it waits — the attempt history lives in attempt_log.
export async function retryCampaignFailed(campaignId, maxRetries = 3) {
  const { data: recs } = await supabase.from('campaign_recipients').select('id, status, attempts, wa_message_id').eq('campaign_id', campaignId);
  const map = await msgStatusMap(recs || []);
  const failed = (recs || []).filter(r => classifyRecipient(r, map) === 'failed');
  if (!failed.length) return { ok: false, error: 'No failed recipients to retry.' };
  const nextIso = nextRetryAtISO();
  const extra = Math.max(1, Number(maxRetries) || 0);
  for (const r of failed) {
    const { error } = await supabase.from('campaign_recipients')
      .update({ status: 'retry', max_attempts: (r.attempts || 0) + extra, next_attempt_at: nextIso, error: null, wa_message_id: null })
      .eq('id', r.id);
    if (error) return { ok: false, error: error.message };
  }
  await supabase.from('campaigns').update({ status: 'sending' }).eq('id', campaignId);
  return { ok: true, count: failed.length };
}

// Failed messages are retried the NEXT day at 00:05 IST (India), matching the
// campaign-run and webhook schedulers, so retries don't hammer Meta's rate cap.
function nextRetryAtISO() {
  const IST_OFFSET_MS = 330 * 60 * 1000; // +05:30
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const y = nowIST.getUTCFullYear(), mo = nowIST.getUTCMonth(), d = nowIST.getUTCDate();
  return new Date(Date.UTC(y, mo, d + 1, 0, 5, 0) - IST_OFFSET_MS).toISOString();
}

// ─── Flows / Sequences (Automation) ────────────────────────────────────────────
export async function getFlowsLive() {
  const { data, error } = await supabase
    .from('sequences')
    .select('*, sequence_steps(count), sequence_enrollments(count)')
    .order('created_at', { ascending: false });
  if (error) { console.error('getFlowsLive', error); return []; }
  return data.map(s => ({
    ...s,
    stepCount: s.sequence_steps?.[0]?.count ?? 0,
    enrolledCount: s.sequence_enrollments?.[0]?.count ?? 0,
  }));
}

export async function getFlowSteps(sequenceId) {
  const { data, error } = await supabase
    .from('sequence_steps')
    .select('*')
    .eq('sequence_id', sequenceId)
    .order('position', { ascending: true });
  if (error) { console.error('getFlowSteps', error); return []; }
  return data;
}

// Create or update a flow and replace its steps in one go.
// flow = { id?, name, trigger_type, exit_on_reply, status }
// steps = [{ template_name, template_language, delay_after_minutes }]
export async function saveFlow(flow, steps) {
  const payload = {
    name: flow.name,
    trigger_type: flow.trigger_type,
    exit_on_reply: flow.exit_on_reply,
    status: flow.status ?? 'draft',
  };
  let seqId = flow.id;

  if (seqId) {
    const { error } = await supabase.from('sequences').update(payload).eq('id', seqId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase.from('sequences').insert(payload).select('id').single();
    if (error) return { ok: false, error: error.message };
    seqId = data.id;
  }

  // Replace steps: delete existing, insert current.
  await supabase.from('sequence_steps').delete().eq('sequence_id', seqId);
  if (steps.length) {
    const rows = steps.map((s, i) => ({
      sequence_id: seqId,
      position: i + 1,
      template_name: s.template_name,
      template_language: s.template_language || 'en',
      delay_after_minutes: s.delay_after_minutes || 0,
    }));
    const { error } = await supabase.from('sequence_steps').insert(rows);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, id: seqId };
}

export async function setFlowStatus(id, status) {
  const { error } = await supabase.from('sequences').update({ status }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteFlow(id) {
  const { error } = await supabase.from('sequences').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ─── App settings ───────────────────────────────────────────────────────────────
// Delete a contact and its dependent rows (conversations, messages, flow runs).
export async function deletePersonLive(id) {
  try { await supabase.from('flow_runs').delete().eq('contact_id', id); } catch { /* may be service-role only */ }
  const { data: convs } = await supabase.from('conversations').select('id').eq('contact_id', id);
  const convIds = (convs || []).map(c => c.id);
  if (convIds.length) {
    await supabase.from('messages').delete().in('conversation_id', convIds);
    await supabase.from('conversations').delete().eq('contact_id', id);
  }
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Move a lead to a pipeline stage (CRM Kanban drag-drop).
export async function updateLeadStatusLive(id, status) {
  const { error } = await supabase.from('contacts').update({ lead_status: status }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Add a lead from the CRM (richer than addContactLive — stage, score, attributes, form).
export async function addLeadLive(d) {
  const clean = String(d.phone || '').replace(/[\s\-()]/g, '');
  const wa_id = clean.startsWith('+') ? clean : '+' + clean;
  if (wa_id.length < 8) return { ok: false, error: 'A valid phone number is required.' };
  const score = Number(d.lead_score);
  const row = {
    wa_id,
    profile_name: d.name || wa_id,
    email: d.email || null,
    company: d.company || null,
    job_title: d.jobTitle || null,
    lead_status: d.lead_status || 'New',
    lead_score: Number.isFinite(score) ? score : 0,
    source: d.source || 'Manual',
    form_id: d.form_id || null,
    attributes: d.attributes || {},
  };
  const { data, error } = await supabase.from('contacts')
    .upsert(row, { onConflict: 'wa_id', ignoreDuplicates: false })
    .select('id').single();
  return error ? { ok: false, error: error.message } : { ok: true, id: data.id };
}

// Count of conversations with unread inbound messages (for the Inbox nav badge).
export async function getUnreadCount(channel) {
  let q = supabase.from('conversations').select('*', { count: 'exact', head: true }).gt('unread_count', 0);
  if (channel) q = q.eq('channel', channel);
  const { count } = await q;
  return count || 0;
}

// Manually add a contact from the People screen.
export async function addContactLive({ name, phone, email, company, source }) {
  const clean = String(phone || '').replace(/[\s\-()]/g, '');
  const wa_id = clean.startsWith('+') ? clean : '+' + clean;
  if (wa_id.length < 8) return { ok: false, error: 'A valid phone number is required.' };
  const { data, error } = await supabase.from('contacts').insert({
    wa_id,
    profile_name: name || wa_id,
    email: email || null,
    company: company || null,
    lead_status: 'New',
    source: source || 'Manual',
  }).select('id').single();
  return error ? { ok: false, error: error.message } : { ok: true, id: data.id };
}

// Real dashboard metrics aggregated from the live DB.
// ONE round-trip: the home_stats() SQL function assembles every counter, the
// recent leads and the flow list in a single pass. This used to be 13 separate
// REST calls, which is what made the dashboard feel slow to load.
const EMPTY_STATS = {
  leadsIn: 0, leadsMonth: 0, conversations: 0, qualified: 0, won: 0,
  sent: 0, received: 0, flowRuns: 0, activeFlows: 0, completedRuns: 0,
  hotLeads: 0, warmLeads: 0, coldLeads: 0,
  leadPipeline: 0, dealPipeline: 0, dealValueOpen: 0, dealValueBooked: 0,
  recent: [], flows: [],
};
export async function getHomeStatsLive() {
  const { data, error } = await supabase.rpc('home_stats');
  if (error || !data) { console.error('getHomeStatsLive', error); return EMPTY_STATS; }
  return {
    ...EMPTY_STATS,
    ...data,
    recent: (data.recent || []).map(c => ({
      id: c.id, name: c.name, source: c.source, status: c.status,
      temperature: c.temperature || 'cold',
      pipeline: c.pipeline || 'lead',
      deal_value_cr: c.deal_value_cr ?? null,
      received: exactTime(c.created_at),
    })),
    flows: data.flows || [],
  };
}

// One contact, fully mapped. Screens that only hold a lead id — the dashboard's
// Recent Leads list, a notification tap — use this to open the detail popup
// without loading the whole contact table.
export async function getContactLive(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('contacts').select('*').eq('id', id).maybeSingle();
  if (error) { console.error('getContactLive', error); return null; }
  const c = mapContact(data);
  if (!c) return null;
  // ContactPanel expects the CRM-list shape, which carries a couple of fields
  // mapContact does not: an avatar colour and the '-' placeholders.
  return {
    ...c,
    phone: c.wa_id || c.phone || '',
    company: c.company || '-',
    jobTitle: c.jobTitle || '-',
    lastContacted: relativeTime(data.last_inbound_at || data.created_at),
    received: exactTime(data.created_at),
  };
}

export async function getSettings() {
  const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
  if (error) { console.error('getSettings', error); return null; }
  return data;
}

export async function saveSettings(patch) {
  const { error } = await supabase.from('app_settings').update(patch).eq('id', 1);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export const DEFAULT_STAGES = LEAD_STAGES;
export async function getPipelineStages() {
  const s = await getSettings();
  const st = s?.pipeline_stages;
  return Array.isArray(st) && st.length ? st : LEAD_STAGES;
}
export async function savePipelineStages(stages) {
  const clean = (stages || []).map(s => String(s).trim()).filter(Boolean);
  if (!clean.length) return { ok: false, error: 'Keep at least one stage.' };
  return saveSettings({ pipeline_stages: clean });
}
export async function getDealStages() {
  const s = await getSettings();
  const st = s?.deal_stages;
  return Array.isArray(st) && st.length ? st : DEAL_STAGES;
}
export async function saveDealStages(stages) {
  const clean = (stages || []).map(s => String(s).trim()).filter(Boolean);
  if (!clean.length) return { ok: false, error: 'Keep at least one stage.' };
  return saveSettings({ deal_stages: clean });
}
// Both boards in one round trip — every screen that renders a stage needs both
// lists, if only to work out which board a contact belongs to.
export async function getStageConfig() {
  const s = await getSettings();
  const lead = Array.isArray(s?.pipeline_stages) && s.pipeline_stages.length ? s.pipeline_stages : LEAD_STAGES;
  const deal = Array.isArray(s?.deal_stages)     && s.deal_stages.length     ? s.deal_stages     : DEAL_STAGES;
  return { lead, deal };
}

// ─── Temperature + deal value ───────────────────────────────────────────────
// `temperature` itself is a generated column, so we only ever write the
// override. Passing null hands the lead back to the automatic rule.
export async function setLeadTemperature(id, temp) {
  const v = temp === null || temp === undefined || temp === 'auto' ? null : String(temp).toLowerCase();
  if (v !== null && !TEMPERATURES.includes(v)) return { ok: false, error: 'Not a valid tag.' };
  const { data, error } = await supabase.from('contacts')
    .update({ temperature_override: v }).eq('id', id)
    .select('temperature, temperature_override').maybeSingle();
  return error ? { ok: false, error: error.message } : { ok: true, ...data };
}

// Setting a number pins it; passing null lets the property/budget rule take
// over again on the next write.
export async function setDealValue(id, cr) {
  const manual = cr !== null && cr !== undefined && String(cr).trim() !== '';
  const n = manual ? Number(String(cr).replace(/[^\d.]/g, '')) : null;
  if (manual && (!Number.isFinite(n) || n < 0)) return { ok: false, error: 'Enter a number in crore.' };
  const patch = manual
    ? { deal_value_cr: n, deal_value_is_manual: true }
    : { deal_value_is_manual: false, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('contacts')
    .update(patch).eq('id', id)
    .select('deal_value_cr, deal_value_is_manual').maybeSingle();
  return error ? { ok: false, error: error.message } : { ok: true, ...data };
}

// Move a contact between boards. `lead_status` is authoritative — the DB
// trigger derives `pipeline` from it — so this is a stage write with a guard
// that the stage actually belongs to the board being asked for.
export async function moveLeadToPipeline(id, pipeline, stage) {
  const { lead, deal } = await getStageConfig();
  const list = pipeline === 'deal' ? deal : lead;
  const target = list.includes(stage) ? stage : list[0];
  const { error } = await supabase.from('contacts').update({ lead_status: target }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true, lead_status: target, pipeline };
}

// ─── Team roster ────────────────────────────────────────────────────────────────
export async function getTeamLive() {
  const { data, error } = await supabase.from('team_members').select('*').order('created_at', { ascending: true });
  if (error) { console.error('getTeamLive', error); return []; }
  return data || [];
}
export async function addTeamMember({ name, email, role }) {
  if (!String(name || '').trim() && !String(email || '').trim()) return { ok: false, error: 'Add a name or email.' };
  const { data, error } = await supabase.from('team_members')
    .insert({ name: name?.trim() || null, email: email?.trim() || null, role: role || 'Member' })
    .select('*').single();
  return error ? { ok: false, error: error.message } : { ok: true, member: data };
}
export async function removeTeamMember(id) {
  const { error } = await supabase.from('team_members').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ─── People / Forms ─────────────────────────────────────────────────────────────
export async function getFormsLive() {
  const { data, error } = await supabase
    .from('fb_forms')
    .select('id, form_id, name, fields')
    .order('name', { ascending: true });
  if (error) { console.error('getFormsLive', error); return []; }
  return data;
}

export async function getPeopleLive() {
  const { data, error } = await supabase
    .from('contacts')
    .select('*, fb_forms(id, name)')
    .order('created_at', { ascending: false });
  if (error) { console.error('getPeopleLive', error); return []; }
  return data.map(c => {
    const name = c.profile_name || c.wa_id || 'Unknown';
    const parts = name.trim().split(' ');
    return {
      id: c.id,
      profile_name: name,
      firstName: c.first_name || parts[0] || '',
      lastName: c.last_name || parts.slice(1).join(' ') || '',
      phone: c.wa_id,
      email: c.email || '',
      company: c.company || '-',
      jobTitle: c.job_title || '-',
      lead_status: c.lead_status || 'New',
      lead_score: c.lead_score ?? 0,
      pipeline: c.pipeline || 'lead',
      temperature: c.temperature || 'cold',
      temperature_override: c.temperature_override || null,
      deal_value_cr: c.deal_value_cr ?? null,
      deal_value_is_manual: !!c.deal_value_is_manual,
      source: c.source || '-',
      attributes: c.attributes || {},
      color: colorFor(c.wa_id || c.id),
      lastContacted: relativeTime(c.last_inbound_at || c.created_at),
      received: exactTime(c.created_at),
      form_uuid: c.form_id,
      formName: c.fb_forms?.name || null,
    };
  });
}

// Read-only feed for the Leads Overview page. Each row is tagged with a derived
// SOURCE (ctwa | instant_form | unknown), a human FUNNEL name, and its TYPE
// (qualification). Reads the stored `source_type`, falling back to deriving it
// for any row not yet backfilled. No writes.
export async function getLeadsOverview() {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, profile_name, wa_id, source_type, ctwa_clid, form_id, qualification, created_at, attributes, temperature, lead_status, pipeline, deal_value_cr, fb_forms(name)')
    .order('created_at', { ascending: false });
  if (error) { console.error('getLeadsOverview', error); return []; }
  return (data || []).map(c => {
    const attrs = c.attributes || {};
    const source = c.source_type
      || (c.ctwa_clid ? 'ctwa' : ((attrs.meta_lead_id || c.form_id) ? 'instant_form' : 'unknown'));
    let funnel = '-';
    if (source === 'ctwa') funnel = attrs.ctwa_headline || attrs.ctwa_source_id || attrs.ctwa_ad_id || 'CTWA ad';
    else if (source === 'instant_form') funnel = c.fb_forms?.name || attrs.form_name || attrs.campaign_name || '-';
    return {
      id: c.id,
      name: c.profile_name || c.wa_id || 'Unknown',
      phone: c.wa_id || '',
      source,                       // 'ctwa' | 'instant_form' | 'unknown'
      funnel,
      type: c.qualification || 'Intake',
      temperature: c.temperature || 'cold',
      lead_status: c.lead_status || 'New',
      pipeline: c.pipeline || 'lead',
      deal_value_cr: c.deal_value_cr ?? null,
      created_at: c.created_at,
      created_rel: relativeTime(c.created_at),
    };
  });
}

// Pull the latest lead forms from Meta (page) into the DB, then return count.
export async function syncFormsFromMeta() {
  const { data, error } = await supabase.functions.invoke('sync-forms', { body: {} });
  if (error) {
    let detail = error.message;
    try { const ctx = await error.context?.json?.(); if (ctx?.error) detail = ctx.error; } catch { /* ignore */ }
    return { ok: false, error: detail };
  }
  return { ok: true, synced: data?.synced ?? 0 };
}

// ─── Visual Flow Builder graph (flows / flow_nodes / flow_edges) ─────────────────
export async function getFlowList() {
  const [{ data, error }, { data: metrics }] = await Promise.all([
    supabase.from('flows').select('id, name, status, updated_at').order('updated_at', { ascending: false }),
    supabase.rpc('flow_metrics'),
  ]);
  if (error) { console.error('getFlowList', error); return []; }
  const mById = {};
  (metrics || []).forEach(m => { mById[m.flow_id] = m; });
  return (data || []).map(f => {
    const m = mById[f.id] || {};
    return {
      ...f,
      triggered: m.triggered || 0,
      sent: m.sent || 0,
      failed: m.failed || 0,
      costRupees: (Number(m.cost_paise) || 0) / 100,
    };
  });
}

export async function createFlowRecord(name = 'Untitled flow') {
  const { data, error } = await supabase.from('flows').insert({ name }).select('id').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export async function getFlowGraphLive(flowId) {
  const [{ data: flow }, { data: nodes }, { data: edges }] = await Promise.all([
    supabase.from('flows').select('id, name, status').eq('id', flowId).maybeSingle(),
    supabase.from('flow_nodes').select('*').eq('flow_id', flowId),
    supabase.from('flow_edges').select('*').eq('flow_id', flowId),
  ]);
  if (!flow) return null;
  return {
    id: flow.id,
    name: flow.name,
    status: flow.status,
    nodes: (nodes || []).map(n => ({
      id: n.node_key, type: n.type, position: { x: n.position_x, y: n.position_y }, data: n.data || {},
    })),
    edges: (edges || []).map(e => ({
      id: e.edge_key || `${e.source_node_key}-${e.target_node_key}-${e.source_handle || ''}`,
      source: e.source_node_key,
      target: e.target_node_key,
      sourceHandle: e.source_handle || undefined,
      label: e.label || undefined,
      data: { sourceButton: e.source_button ?? null },
    })),
  };
}

// Replace the whole graph for a flow (nodes + edges) and update name/status.
export async function saveFlowGraphLive(flowId, graph) {
  if (graph.name != null || graph.status != null) {
    const patch = {};
    if (graph.name != null) patch.name = graph.name;
    if (graph.status != null) patch.status = graph.status;
    const { error } = await supabase.from('flows').update(patch).eq('id', flowId);
    if (error) return { ok: false, error: error.message };
  }

  await supabase.from('flow_nodes').delete().eq('flow_id', flowId);
  await supabase.from('flow_edges').delete().eq('flow_id', flowId);

  if (graph.nodes?.length) {
    const nodeRows = graph.nodes.map(n => ({
      flow_id: flowId, node_key: n.id, type: n.type, data: n.data || {},
      position_x: n.position?.x ?? 0, position_y: n.position?.y ?? 0,
    }));
    const { error } = await supabase.from('flow_nodes').insert(nodeRows);
    if (error) return { ok: false, error: error.message };
  }
  if (graph.edges?.length) {
    const edgeRows = graph.edges.map(e => ({
      flow_id: flowId, edge_key: e.id,
      source_node_key: e.source, target_node_key: e.target,
      source_handle: e.sourceHandle ?? null,
      source_button: e.data?.sourceButton ?? e.sourceButton ?? null,
      label: e.label ?? null,
    }));
    const { error } = await supabase.from('flow_edges').insert(edgeRows);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function setFlowGraphStatus(flowId, status) {
  const { error } = await supabase.from('flows').update({ status }).eq('id', flowId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteFlowRecord(flowId) {
  const { error } = await supabase.from('flows').delete().eq('id', flowId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ─── Contact notes (call remarks / log, Zoho-style) ─────────────────────────────
export async function getNotesLive(contactId) {
  if (!contactId) return [];
  const { data, error } = await supabase
    .from('contact_notes')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false });
  if (error) { console.error('getNotesLive', error); return []; }
  return data || [];
}

export async function addNoteLive(contactId, body) {
  const text = (body || '').trim();
  if (!contactId || !text) return { ok: false, error: 'Note is empty.' };
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('contact_notes')
    .insert({ contact_id: contactId, body: text, created_by: u?.user?.id ?? null })
    .select('*')
    .single();
  return error ? { ok: false, error: error.message } : { ok: true, note: data };
}

export async function deleteNoteLive(noteId) {
  const { error } = await supabase.from('contact_notes').delete().eq('id', noteId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ─── Property Master + per-lead pitch tracking ──────────────────────────────────
export const PROPERTY_STATUSES = ['interested', 'pitched', 'visited', 'negotiating', 'booked', 'rejected'];
export const REJECTION_REASONS = ['budget', 'location', 'configuration', 'possession', 'competitor', 'other'];

export async function getProperties() {
  const { data, error } = await supabase
    .from('properties').select('*').eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) { console.error('getProperties', error); return []; }
  return data || [];
}

// Properties tagged to one lead, joined with the property details.
export async function getLeadProperties(contactId) {
  if (!contactId) return [];
  const { data, error } = await supabase
    .from('lead_properties')
    .select('*, properties(*)')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getLeadProperties', error); return []; }
  return (data || []).map(lp => ({
    id: lp.id, property_id: lp.property_id, status: lp.status,
    rejection_reason: lp.rejection_reason, note: lp.note,
    property: lp.properties,
  }));
}

// Tag a lead as interested in a property (idempotent on contact+property).
export async function tagLeadProperty(contactId, propertyId) {
  const { error } = await supabase
    .from('lead_properties')
    .upsert({ contact_id: contactId, property_id: propertyId, status: 'interested' },
            { onConflict: 'contact_id,property_id', ignoreDuplicates: true });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Move a pitch along the mini-pipeline. For 'rejected', pass a reason to KEEP the
// history of why it didn't land (better than deleting — see the app's rationale).
export async function setLeadPropertyStatus(id, status, rejection_reason = null) {
  const { error } = await supabase
    .from('lead_properties')
    .update({ status, rejection_reason: status === 'rejected' ? rejection_reason : null })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Hard remove a tag (for mistakes). Prefer setLeadPropertyStatus('rejected') to keep history.
export async function removeLeadProperty(id) {
  const { error } = await supabase.from('lead_properties').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Suggest properties that fit a lead's budget + area + configuration. Uses the
// parsed numeric fields; a lead with budget 5 Cr and area Worli surfaces the
// Worli projects at or under 5 Cr first. Cheap client-side match over the master.
export function matchProperties(properties, { budgetCr, area, bhk } = {}) {
  return properties
    .map(p => {
      let score = 0;
      if (area && p.area && p.area.toLowerCase().includes(String(area).toLowerCase())) score += 3;
      if (budgetCr && p.price_min_cr != null && p.price_min_cr <= Number(budgetCr) * 1.1) score += 2;
      if (bhk && p.configuration && p.configuration.includes(String(bhk))) score += 1;
      return { ...p, matchScore: score };
    })
    .filter(p => p.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);
}

// Aggregate interest across the whole catalogue + per property. "accepted" =
// any active (non-rejected) tag; "rejected" = a rejected tag.
export async function getPropertyStats() {
  const rowsToStats = (rows) => {
    const byProp = {}; let accepted = 0, rejected = 0; const leads = new Set();
    for (const r of rows) {
      const rej = r.status === 'rejected';
      if (rej) rejected++; else accepted++;
      leads.add(r.contact_id);
      byProp[r.property_id] = byProp[r.property_id] || { interested: 0, rejected: 0 };
      if (rej) byProp[r.property_id].rejected++; else byProp[r.property_id].interested++;
    }
    return { accepted, rejected, leads: leads.size, total: rows.length, byProp };
  };
  const { data, error } = await supabase.from('lead_properties').select('contact_id, property_id, status');
  if (error) { console.error('getPropertyStats', error); return { accepted: 0, rejected: 0, leads: 0, total: 0, byProp: {} }; }
  return rowsToStats(data || []);
}

// The leads tagged to one property (for the property detail view).
export async function getPropertyLeads(propertyId) {
  const { data, error } = await supabase
    .from('lead_properties')
    .select('id, status, rejection_reason, contacts(id, profile_name, wa_id, lead_status)')
    .eq('property_id', propertyId);
  if (error) { console.error('getPropertyLeads', error); return []; }
  return (data || []).map(r => ({ id: r.id, status: r.status, rejection_reason: r.rejection_reason, contact: r.contacts }));
}

// Editable master fields. Numeric helpers (price_min_cr, carpet_min/max) power
// the lead-matching, so they are edited too.
// Upload a project photo or developer logo and return its public URL. Reuses
// the existing public wa-media bucket under a properties/ prefix, so nothing
// new has to be provisioned or made public.
export async function uploadPropertyImage(file) {
  if (!file) return { ok: false, error: 'No file selected.' };
  if (!/^image\//.test(file.type || '')) return { ok: false, error: 'Pick an image file.' };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: 'Image must be under 5MB.' };
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `properties/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('wa-media')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) { console.error('uploadPropertyImage', error); return { ok: false, error: error.message }; }
  const { data } = supabase.storage.from('wa-media').getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

// ── Lead tags and custom fields ──────────────────────────────────────────────
// Both live in contacts.attributes, which already holds whatever a lead form
// sent. Tags are attributes.tags (the same array the flow builder's "Add tag"
// action writes to, so the two stay in sync). Anything a person types by hand
// goes under attributes.custom, kept in its own namespace so it can never
// collide with a form answer or an internal key like meta_lead_id.
export async function getLeadExtras(contactId) {
  const { data, error } = await supabase
    .from('contacts').select('attributes').eq('id', contactId).maybeSingle();
  if (error) { console.error('getLeadExtras', error); return { tags: [], custom: {} }; }
  const a = data?.attributes || {};
  return {
    tags: Array.isArray(a.tags) ? a.tags : [],
    custom: (a.custom && typeof a.custom === 'object') ? a.custom : {},
  };
}

// Read-merge-write: attributes is a single jsonb column, so writing only the
// keys we touch would otherwise wipe the rest.
export async function saveLeadExtras(contactId, { tags, custom }) {
  const { data, error: readErr } = await supabase
    .from('contacts').select('attributes').eq('id', contactId).maybeSingle();
  if (readErr) { console.error('saveLeadExtras read', readErr); return { ok: false, error: readErr.message }; }
  const next = { ...(data?.attributes || {}) };
  if (tags !== undefined) next.tags = tags;
  if (custom !== undefined) next.custom = custom;
  const { error } = await supabase.from('contacts').update({ attributes: next }).eq('id', contactId);
  if (error) { console.error('saveLeadExtras write', error); return { ok: false, error: error.message }; }
  return { ok: true };
}

// Writes the whole attributes object back. The caller has already merged, since
// only it knows whether an answer belongs at the top level or inside
// form_answers.
export async function saveLeadAnswers(contactId, attributes) {
  const { error } = await supabase.from('contacts').update({ attributes }).eq('id', contactId);
  if (error) { console.error('saveLeadAnswers', error); return { ok: false, error: error.message }; }
  return { ok: true };
}

// ── Site visits ──────────────────────────────────────────────────────────────
// scope: 'upcoming' | 'past' | 'all'. Upcoming drives the dashboard tile and is
// the default view, since a visit tracker is about what is coming, not history.
export async function getVisits(scope = 'upcoming') {
  let q = supabase
    .from('visits')
    .select('*, contacts(id, profile_name, wa_id, ig_username, temperature, lead_status, deal_value_cr), properties(id, name, area)');
  const nowIso = new Date().toISOString();
  if (scope === 'upcoming') q = q.gte('scheduled_at', nowIso).eq('status', 'scheduled').order('scheduled_at', { ascending: true });
  else if (scope === 'past') q = q.lt('scheduled_at', nowIso).order('scheduled_at', { ascending: false });
  else q = q.order('scheduled_at', { ascending: false });

  const { data, error } = await q.limit(200);
  if (error) { console.error('getVisits', error); return []; }
  return (data || []).map(v => ({
    ...v,
    leadName: v.contacts?.profile_name || v.contacts?.wa_id || (v.contacts?.ig_username ? `@${v.contacts.ig_username}` : 'Unknown'),
    leadTemperature: v.contacts?.temperature || 'cold',
    leadStage: v.contacts?.lead_status || 'New',
    leadPhone: v.contacts?.wa_id || '',
    propertyName: v.properties?.name || '',
    propertyArea: v.properties?.area || '',
  }));
}

export async function createVisit(v) {
  // Default the reminder to 2 hours before, which is the useful moment for a
  // site visit: enough time to leave, not so early it is forgotten.
  const remind = v.remind_at
    ?? (v.scheduled_at ? new Date(new Date(v.scheduled_at).getTime() - 2 * 3600_000).toISOString() : null);
  const { data, error } = await supabase.from('visits').insert({
    contact_id: v.contact_id,
    property_id: v.property_id || null,
    scheduled_at: v.scheduled_at,
    duration_mins: Number(v.duration_mins) || 60,
    location: v.location || null,
    notes: v.notes || null,
    remind_at: remind,
  }).select('id').single();
  if (error) { console.error('createVisit', error); return { ok: false, error: error.message }; }
  return { ok: true, id: data.id };
}

export async function updateVisit(id, patch) {
  const { error } = await supabase.from('visits').update(patch).eq('id', id);
  if (error) { console.error('updateVisit', error); return { ok: false, error: error.message }; }
  return { ok: true };
}

export const PROPERTY_FIELDS = [
  { key: 'name', label: 'Project name', required: true },
  { key: 'developer', label: 'Developer' },
  { key: 'image_url', label: 'Project photo', image: true },
  { key: 'developer_logo_url', label: 'Developer logo', image: true },
  { key: 'area', label: 'Area / Micro-market' },
  { key: 'status', label: 'Status', options: ['RTMI', 'UC', 'Launch'] },
  { key: 'project_size', label: 'Project size (e.g. 1.7 Acre · 2 Towers · 197 units)' },
  { key: 'configuration', label: 'Configuration' },
  { key: 'carpet_size', label: 'Carpet size (text, e.g. 944-1334)' },
  { key: 'carpet_min', label: 'Carpet min (sq ft)', type: 'number' },
  { key: 'carpet_max', label: 'Carpet max (sq ft)', type: 'number' },
  { key: 'starting_price', label: 'Starting price (text, e.g. 8 Cr+)' },
  { key: 'price_min_cr', label: 'Starting price (Cr, number)', type: 'number' },
  { key: 'price_max_cr', label: 'Top price (Cr, number)', type: 'number' },
  { key: 'price_per_sqft', label: 'Price per sq ft' },
  { key: 'view', label: 'View' },
  { key: 'positioning', label: 'Positioning' },
  { key: 'possession', label: 'Possession' },
  { key: 'rera_number', label: 'RERA number' },
  { key: 'brochure_url', label: 'Brochure link' },
  { key: 'amenities', label: 'Amenities', textarea: true },
  { key: 'description', label: 'Notes / Description', textarea: true },
];

function cleanPropertyPayload(p) {
  const out = {};
  for (const f of PROPERTY_FIELDS) {
    let v = p[f.key];
    if (v === '' || v === undefined) v = null;
    if (f.type === 'number' && v != null) v = Number(v);
    out[f.key] = v;
  }
  return out;
}

export async function createProperty(p) {
  const payload = cleanPropertyPayload(p);
  const { data, error } = await supabase.from('properties').insert(payload).select('id').single();
  return error ? { ok: false, error: error.message } : { ok: true, id: data.id };
}

export async function updateProperty(id, p) {
  const { error } = await supabase.from('properties').update(cleanPropertyPayload(p)).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteProperty(id) {
  const { error } = await supabase.from('properties').update({ active: false }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ─── Reports: month-by-month ad performance + lead quality ─────────────────────
// Spend/leads/CPL/CTR come from Meta; qualified-vs-not comes from our CRM.
// opts: { since:'YYYY-MM-DD', until:'YYYY-MM-DD' } for an explicit Ads-Manager
// style range, or { months } for the rolling fallback.
export async function getAdsReport(opts = {}) {
  const body = typeof opts === 'number' ? { months: opts } : opts;
  const { data, error } = await supabase.functions.invoke('meta-ads-report', { body });
  if (error) {
    let detail = error.message;
    try { const ctx = await error.context?.json?.(); if (ctx?.error) detail = ctx.error; } catch { /* ignore */ }
    return { ok: false, error: detail };
  }
  return data;
}

export { msgTime, relativeTime };

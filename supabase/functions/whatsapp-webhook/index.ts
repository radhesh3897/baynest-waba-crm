// whatsapp-webhook — public, no JWT required
// Deploy with: supabase functions deploy whatsapp-webhook --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Supplied by the Supabase edge runtime. Keeps the isolate alive until the
// promise settles, so work that outlives the response actually finishes.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_SECRET    = Deno.env.get("META_APP_SECRET") ?? "";
const WHATSAPP_TOKEN   = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const PHONE_NUMBER_ID  = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const META_API_VERSION = Deno.env.get("META_API_VERSION") ?? "v21.0";

// Verified on real traffic (signature valid=true), now ENFORCED: unsigned or
// forged POSTs are rejected with 401. Requires META_APP_SECRET to be set.
const ENFORCE_SIGNATURE = true;

// Inbound types that arrive as a media ID rather than a file, so they need
// fetching off Meta before anyone can open them.
const MEDIA_MSG_TYPES = new Set(["audio", "voice", "image", "video", "document", "sticker"]);

// Verify Meta's X-Hub-Signature-256: 'sha256=' + HMAC-SHA256(app_secret, rawBody).
async function signatureValid(rawBody: string, header: string | null): Promise<boolean> {
  if (!APP_SECRET || !header) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(APP_SECRET),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const hex = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, "0")).join("");
    const expected = "sha256=" + hex;
    // constant-time compare
    if (expected.length !== header.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
    return diff === 0;
  } catch (e) {
    console.error("[webhook] signature check error", e);
    return false;
  }
}

serve(async (req: Request) => {
  // ── GET: Meta webhook verification ──────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ── POST: Incoming event ─────────────────────────────────────
  if (req.method === "POST") {
    // Read the RAW body once (needed for the HMAC) then parse the same bytes.
    const raw = await req.text();

    const valid = await signatureValid(raw, req.headers.get("x-hub-signature-256"));
    if (ENFORCE_SIGNATURE && !valid) {
      console.warn("[webhook] rejected: invalid signature");
      return new Response("Forbidden", { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    // Always return 200 fast — Meta retries if we're slow. The real work runs on
    // after the response, so hand the promise to the runtime: WITHOUT waitUntil
    // the isolate can be reclaimed the moment we return, silently cutting the
    // work off part-way (a lead's AI reply never gets sent). That is not
    // theoretical — it dropped a live Click-to-WhatsApp lead ~4s in.
    const work = processWebhook(body).catch(console.error);
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    return new Response("OK", { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
});

async function processWebhook(body: Record<string, unknown>) {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  // The same app — and therefore the same callback URL — receives two different
  // objects: WhatsApp messages (object: "whatsapp_business_account") and Meta
  // Lead Ads (object: "page"). Both are signed with the same app secret, so the
  // check above already covers them; only the payload shape differs.
  const isPage = body?.object === "page";

  // Log raw event first (idempotent: duplicate POSTs are fine, just extra rows)
  await db.from("webhook_events").insert({
    event_type: isPage ? "leadgen" : "whatsapp",
    raw: body,
    received_at: new Date().toISOString(),
  });

  if (isPage) {
    await processLeadgenEvents(db, body);
    await db.from("webhook_events")
      .update({ processed: true })
      .eq("raw->>'entry'", JSON.stringify(body.entry));
    return;
  }

  const entries = (body?.entry as unknown[]) ?? [];
  for (const entry of entries) {
    const changes = ((entry as Record<string, unknown>)?.changes as unknown[]) ?? [];
    for (const change of changes) {
      const value = (change as Record<string, unknown>)?.value as Record<string, unknown> ?? {};

      const contacts = (value.contacts as unknown[]) ?? [];

      // Process inbound messages
      for (const msg of (value.messages as unknown[]) ?? []) {
        await processInboundMessage(db, msg as Record<string, unknown>, contacts, value.metadata);
      }

      // Update outbound message statuses
      for (const status of (value.statuses as unknown[]) ?? []) {
        await processStatusUpdate(db, status as Record<string, unknown>);
      }
    }
  }

  // Mark processed
  await db.from("webhook_events")
    .update({ processed: true })
    .eq("raw->>'entry'", JSON.stringify(body.entry));
}

// ── Meta Lead Ads ────────────────────────────────────────────────────────────
// Meta only tells us a lead EXISTS (leadgen_id); the answers have to be pulled
// off the Graph API with a Page token. We then hand the parsed lead to
// ingest-lead so the webhook path and the n8n path stay one code path.

const INGEST_SECRET = Deno.env.get("INGEST_SECRET") ?? "";

// Meta names form fields loosely ("phone_number", "phone", "what_is_your_phone").
// Match on substring so a renamed question doesn't silently drop the phone.
function pickField(fields: Record<string, string>, needles: string[]): string {
  for (const n of needles) if (fields[n]) return fields[n];
  for (const [k, v] of Object.entries(fields)) {
    if (v && needles.some(n => k.includes(n))) return v;
  }
  return "";
}

async function pageAccessToken(pageId: string): Promise<string> {
  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${pageId}?fields=access_token&access_token=${WHATSAPP_TOKEN}`);
  const j = await res.json().catch(() => ({}));
  return ((j as Record<string, unknown>).access_token as string) ?? "";
}

async function processLeadgenEvents(db: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  for (const entry of ((body.entry as unknown[]) ?? [])) {
    for (const change of (((entry as Record<string, unknown>).changes as unknown[]) ?? [])) {
      const c = change as Record<string, unknown>;
      if (c.field !== "leadgen") continue;
      const v = (c.value as Record<string, unknown>) ?? {};
      const leadgenId = String(v.leadgen_id ?? "");
      if (!leadgenId) continue;

      // Claim the lead. A duplicate delivery loses the insert and returns here,
      // so the welcome template can only ever go out once per form fill.
      const { error: claimErr } = await db.from("meta_leadgen_events").insert({
        leadgen_id: leadgenId,
        page_id: String(v.page_id ?? ""),
        form_id: String(v.form_id ?? ""),
        ad_id: String(v.ad_id ?? ""),
        raw: v,
      });
      if (claimErr) {
        console.log("[leadgen] already processed", leadgenId);
        continue;
      }

      try {
        await fetchAndIngestLead(db, leadgenId, String(v.page_id ?? ""));
      } catch (e) {
        console.error("[leadgen] failed", leadgenId, e);
        await db.from("meta_leadgen_events")
          .update({ status: "error", error: String((e as Error).message ?? e) })
          .eq("leadgen_id", leadgenId);
      }
    }
  }
}

async function fetchAndIngestLead(db: ReturnType<typeof createClient>, leadgenId: string, pageId: string) {
  // A Page token reads the lead; the system-user token alone cannot.
  const token = pageId ? await pageAccessToken(pageId) : "";
  if (!token) throw new Error(`no page token for page ${pageId}`);

  const fieldList = "id,created_time,field_data,form_id,ad_id,ad_name,adset_name,campaign_name,platform,is_organic";
  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${leadgenId}?fields=${fieldList}&access_token=${token}`);
  const lead = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new Error(`graph read failed: ${JSON.stringify(lead)}`);

  // field_data is [{ name, values: [..] }] — flatten to a plain map.
  const fields: Record<string, string> = {};
  for (const f of ((lead.field_data as Record<string, unknown>[]) ?? [])) {
    const key = String(f.name ?? "").toLowerCase();
    const val = ((f.values as unknown[]) ?? [])[0];
    if (key && val != null && val !== "") fields[key] = String(val);
  }

  const phone = pickField(fields, ["phone_number", "phone", "mobile", "whatsapp", "contact_number"]);
  if (!phone) throw new Error(`lead ${leadgenId} has no phone field (got: ${Object.keys(fields).join(",")})`);

  const payload: Record<string, unknown> = {
    phone,
    name: pickField(fields, ["full_name", "name"]),
    first_name: fields.first_name ?? "",
    last_name: fields.last_name ?? "",
    email: pickField(fields, ["email"]),
    city: pickField(fields, ["city", "location", "area"]),
    source: "Meta Lead Ads",
    form_id: String(lead.form_id ?? ""),
    // Everything below lands in contacts.attributes — meta_lead_id is what
    // capi-lead-event needs later to report the qualified lead back to Meta.
    meta_lead_id: leadgenId,
    ad_name: lead.ad_name ?? null,
    adset_name: lead.adset_name ?? null,
    campaign_name: lead.campaign_name ?? null,
    platform: lead.platform ?? null,
    lead_created_time: lead.created_time ?? null,
    form_answers: fields,
  };

  const ing = await fetch(`${SUPABASE_URL}/functions/v1/ingest-lead`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-ingest-secret": INGEST_SECRET },
    body: JSON.stringify(payload),
  });
  const out = await ing.json().catch(() => ({})) as Record<string, unknown>;
  if (!ing.ok) throw new Error(`ingest-lead ${ing.status}: ${JSON.stringify(out)}`);

  await db.from("meta_leadgen_events")
    .update({ status: "ingested", contact_id: (out.contact_id as string) ?? null })
    .eq("leadgen_id", leadgenId);

  console.log("[leadgen] ingested", leadgenId, "→", out.contact_id, "enrolled:", out.enrolled);
}

async function processInboundMessage(
  db: ReturnType<typeof createClient>,
  msg: Record<string, unknown>,
  waContacts: unknown[],
  _metadata: unknown,
) {
  const rawWaId = String(msg.from ?? "");
  if (!rawWaId) return;

  // Normalise: WhatsApp sends without leading '+', we store with it
  const waId = rawWaId.startsWith("+") ? rawWaId : "+" + rawWaId;

  // Look up profile name from the contacts array in the webhook payload
  const contactProfile = (waContacts as Record<string, unknown>[]).find(
    (c) => {
      const cWaId = String((c as Record<string, unknown>).wa_id ?? "");
      return cWaId === rawWaId || "+" + cWaId === waId;
    },
  );
  const profileName =
    ((contactProfile as Record<string, unknown>)?.profile as Record<string, unknown>)?.name as string
    ?? waId;

  // Upsert contact — only set profile_name on insert, don't overwrite agent edits
  const { data: contact, error: contactErr } = await db
    .from("contacts")
    .upsert(
      { wa_id: waId, profile_name: profileName },
      { onConflict: "wa_id", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (contactErr || !contact) {
    console.error("contact upsert failed", contactErr);
    return;
  }

  // ── CTWA capture ──────────────────────────────────────────────────────────
  // A Click-to-WhatsApp ad tap attaches a `referral.ctwa_clid` to the FIRST
  // inbound message only. Store it against the contact so we can later fire a
  // conversion event when they qualify. Never overwrite an existing click id
  // (the `.is("ctwa_clid", null)` guard only updates rows that don't have one).
  const referral = msg.referral as Record<string, unknown> | undefined;
  const ctwaClid = referral?.ctwa_clid as string | undefined;
  if (ctwaClid) {
    const { error: clidErr } = await db
      .from("contacts")
      .update({ ctwa_clid: ctwaClid, ctwa_clid_captured_at: new Date().toISOString() })
      .eq("id", contact.id)
      .is("ctwa_clid", null);
    if (clidErr) console.error("ctwa_clid capture failed", clidErr);
  }

  // Find or create conversation
  let { data: conversation } = await db
    .from("conversations")
    .select("id")
    .eq("contact_id", contact.id)
    .maybeSingle();

  // A brand-new conversation = this contact is messaging us for the first time.
  // That is the ONLY case the AI qualifier auto-engages (a Click-to-WhatsApp ad
  // tap lands here), so it never jumps into a chat already in progress.
  const isNewConversation = !conversation;

  if (!conversation) {
    const { data: newConv, error: convErr } = await db
      .from("conversations")
      .insert({ contact_id: contact.id, status: "open" })
      .select("id")
      .single();
    if (convErr || !newConv) {
      console.error("conversation create failed", convErr);
      return;
    }
    conversation = newConv;
  }

  // Resolve body text based on message type
  let textBody: string | null = null;
  const msgType = String(msg.type ?? "text");
  if (msgType === "text") {
    textBody = ((msg.text as Record<string, unknown>)?.body as string) ?? null;
  } else if (msgType === "interactive") {
    const interactive = msg.interactive as Record<string, unknown>;
    textBody =
      ((interactive?.button_reply as Record<string, unknown>)?.title as string) ??
      ((interactive?.list_reply as Record<string, unknown>)?.title as string) ??
      null;
  } else if (msgType === "button") {
    // Quick-reply button tapped on a TEMPLATE message arrives as type "button".
    textBody = ((msg.button as Record<string, unknown>)?.text as string) ?? null;
  }

  // Parse timestamp (Unix seconds → ISO)
  const ts = msg.timestamp
    ? new Date(Number(msg.timestamp) * 1000).toISOString()
    : new Date().toISOString();

  // Insert message — dedupe on wa_message_id (ignoreDuplicates: true)
  const { data: inserted, error: msgErr } = await db.from("messages").upsert(
    {
      conversation_id: conversation.id,
      contact_id:      contact.id,
      wa_message_id:   String(msg.id ?? ""),
      direction:       "in",
      type:            msgType,
      body:            textBody,
      payload:         msg,
      status:          "received",
      created_at:      ts,
    },
    { onConflict: "wa_message_id", ignoreDuplicates: true },
  ).select("id");
  if (msgErr) console.error("message insert failed", msgErr);

  // Genuinely new inbound (not a Meta retry of an already-stored message).
  const justInserted = Array.isArray(inserted) && inserted.length > 0;
  const insertedId = (inserted?.[0] as Record<string, unknown> | undefined)?.id as string | undefined;

  // A voice note / photo / file arrives as a media ID, not a file. Pull it off
  // Meta now and keep our own copy, otherwise it is unplayable in the inbox and
  // Meta drops it after ~30 days. Fire-and-forget: the lead's reply matters more.
  if (justInserted && insertedId && MEDIA_MSG_TYPES.has(msgType)) {
    fetch(`${SUPABASE_URL}/functions/v1/fetch-inbound-media`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ message_id: insertedId }),
    }).catch((e) => console.error("media fetch failed", e));
  }

  // Email alert.
  if (justInserted) {
    fetch(`${SUPABASE_URL}/functions/v1/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({
        kind: "inbound",
        subject: `New WhatsApp message from ${profileName}`,
        text: `${profileName} (${waId}) messaged: "${textBody ?? "(non-text message)"}" — open the DFY inbox to reply.`,
      }),
    }).catch(() => {});
  }

  // AI lead qualifier: on a first-time chat, greet + run the 5-question script
  // automatically, then hand the chat over on qualify. If the AI handled this
  // message we do NOT also run the flow engine (avoids a double reply).
  let aiHandled = false;
  if (justInserted) {
    try {
      aiHandled = await maybeRunAiQualifier(
        db, contact.id, conversation.id, waId, profileName, isNewConversation,
        String(msg.id ?? ""),
      );
    } catch (e) {
      console.error("ai qualifier failed", e);
    }
  }

  // Advance the visual flow engine: resume any waiting flow runs for this contact
  // based on their reply (button tap → matching branch; otherwise enroll into
  // "inbound" trigger flows).
  if (!aiHandled) {
    try {
      const resumed = await advanceFlowsOnReply(db, contact.id, msgType, textBody);
      if (resumed === 0) {
        await db.rpc("enroll_into_flows", { p_contact_id: contact.id, p_trigger: "inbound" });
      }
    } catch (e) {
      console.error("flow reply routing failed", e);
    }
  }
}

// Turn stored messages into the brain's conversation history (inbound = user,
// outbound = assistant).
//
// The subtle part is messages with no text: a voice note, image or file. Simply
// dropping them leaves the history ending on OUR assistant turn, so the model has
// nothing to answer and the lead gets silence. That is exactly what happened to a
// live lead who replied with a voice note. Represent them instead, so the history
// always ends with the lead speaking and the model can ask them to type it out.
function buildHistory(msgs: unknown[] | null): { role: string; content: string }[] {
  const history = (msgs ?? []).map((row) => {
    const m = row as Record<string, unknown>;
    const body = String(m.body ?? "").trim();
    const role = m.direction === "in" ? "user" : "assistant";
    if (body) return { role, content: body };
    // Ours with no text (e.g. a template) carries nothing useful for the model.
    if (role !== "user") return null;
    return { role, content: `[the lead sent a ${String(m.type ?? "media")} message with no text in it]` };
  }).filter(Boolean) as { role: string; content: string }[];

  if (history.length === 0) history.push({ role: "user", content: "Hi" });
  return history.slice(-30);
}

// Auto lead-qualifier. Returns true if the AI is handling this contact (so the
// caller skips other reply routing). Only engages "new / first-time" chats:
// activates when a brand-new conversation opens and the contact has never been
// engaged and is not already qualified. Stays active across their replies until
// the script completes, then marks them Qualified (which fires the CRM pixel +
// CTWA conversion events) and assigns the chat to the team owner.
async function maybeRunAiQualifier(
  db: ReturnType<typeof createClient>,
  contactId: string,
  conversationId: string,
  waId: string,
  name: string,
  isNewConversation: boolean,
  waMessageId: string,
): Promise<boolean> {
  // Global kill switch.
  const { data: settings } = await db
    .from("app_settings").select("ai_qualify_enabled").eq("id", 1).maybeSingle();
  if (!settings?.ai_qualify_enabled) return false;

  const { data: c } = await db
    .from("contacts").select("ai_status, qualification").eq("id", contactId).maybeSingle();
  let status = (c?.ai_status as string | null) ?? null;

  // Activation is limited to first-time chats. Claim it ATOMICALLY: if a lead
  // fires off two messages at once (a real case — "Hi" then "Jfsvn" a few
  // seconds apart), both webhooks race here, and a plain read-then-write lets
  // BOTH greet. The conditional update only flips null->active for the first one
  // to arrive; the loser gets no row back and bails, so there is one greeting.
  if (status === null && isNewConversation && !c?.qualification) {
    const { data: won } = await db
      .from("contacts")
      .update({ ai_status: "active" })
      .eq("id", contactId)
      .is("ai_status", null)
      .select("id")
      .maybeSingle();
    if (!won) return true; // another inbound just activated + is greeting; don't double up
    status = "active";
  }
  if (status !== "active") return false; // done / off / never-activated → hands off to humans

  // We are definitely replying to this one, so start the typing bubble now and
  // let it run while we think. Not awaited: the reply must not wait on cosmetics.
  showTyping(waMessageId);

  // Reconstruct the conversation for the brain (inbound = user, outbound = assistant).
  const { data: msgs } = await db
    .from("messages")
    .select("direction, body, type, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);
  const history = buildHistory(msgs);

  // Ask the shared ai-qualify brain for the next message.
  const aiRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-qualify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({ messages: history, name }),
  });
  const ai = await aiRes.json().catch(() => ({} as Record<string, unknown>));
  const reply = (ai as Record<string, unknown>)?.reply as string | undefined;
  if (!aiRes.ok || !reply) {
    console.error("ai-qualify returned no reply", aiRes.status, ai);
    return true; // AI owns this contact; just nothing to send this turn
  }

  // Send the AI's reply (service role → sent_by null, so it does NOT count as a
  // human takeover). The 24h window is open because the lead just messaged us.
  await fetch(`${SUPABASE_URL}/functions/v1/send-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({ wa_id: waId, type: "text", text: reply }),
  }).catch((e) => console.error("ai reply send failed", e));

  // Script finished → decide what happens. HOW it finished changes everything.
  if ((ai as Record<string, unknown>)?.done === true) {
    await db.from("contacts").update({ ai_status: "done" }).eq("id", contactId);
    const outcome = (ai as Record<string, unknown>)?.outcome as string | undefined;

    if (outcome === "affiliate") {
      // Affiliate / MLM / reseller: we do not work with them. Tag and stop. NO
      // Meta event (not a prospect) and NO expert hand-off (we declined them).
      await db.rpc("tag_contact", { p_contact: contactId, p_tag: "affiliate" });
    } else {
      if (outcome === "buy_leads") {
        // Wants to buy leads, not run ads. Tag for the team and fire NOTHING: a
        // Qualified event here would teach Meta to find more lead buyers.
        await db.rpc("tag_buy_leads", { p_contact: contactId });
      } else {
        // A real ads prospect: mark Qualified + fire the CRM pixel event, which
        // chains the CTWA conversion event for leads that came from a WhatsApp ad.
        fetch(`${SUPABASE_URL}/functions/v1/capi-lead-event`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
          body: JSON.stringify({ source: "contact", id: contactId, qualification: "Qualified" }),
        }).catch(() => {});
      }

      // Hand qualified + buy-leads chats to the team owner. Declined affiliates
      // are deliberately NOT assigned.
      const { data: owner } = await db
        .from("profiles").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (owner?.id) {
        await db.from("conversations").update({ assigned_to: owner.id }).eq("id", conversationId);
      }
    }
  }

  return true;
}

// Resume waiting flow_runs for a contact based on their reply. Returns count resumed.
async function advanceFlowsOnReply(
  db: ReturnType<typeof createClient>,
  contactId: string,
  msgType: string,
  replyText: string | null,
): Promise<number> {
  const { data: runs } = await db
    .from("flow_runs")
    .select("id, flow_id, current_node_key")
    .eq("contact_id", contactId)
    .eq("status", "waiting");
  if (!runs || runs.length === 0) return 0;

  const reply = (replyText ?? "").trim().toLowerCase();
  const isButton = msgType === "interactive" || msgType === "button";
  let resumed = 0;

  for (const run of runs) {
    const { data: node } = await db
      .from("flow_nodes")
      .select("type")
      .eq("flow_id", run.flow_id)
      .eq("node_key", run.current_node_key)
      .maybeSingle();
    if (!node) continue;

    const { data: edges } = await db
      .from("flow_edges")
      .select("source_handle, source_button, target_node_key")
      .eq("flow_id", run.flow_id)
      .eq("source_node_key", run.current_node_key);
    if (!edges || edges.length === 0) continue;

    let target: string | null = null;
    if (node.type === "sendTemplate") {
      // Match the tapped button's label to a branch.
      const hit = edges.find(e => (e.source_button ?? "").trim().toLowerCase() === reply);
      target = hit?.target_node_key ?? null;
    } else if (node.type === "waitReply") {
      const want = isButton ? "button" : "text";
      const hit = edges.find(e => e.source_handle === want) ?? edges[0];
      target = hit?.target_node_key ?? null;
    }

    if (target) {
      await db.from("flow_runs").update({
        current_node_key: target,
        status: "active",
        next_run_at: new Date().toISOString(),
        last_reply: replyText,
        updated_at: new Date().toISOString(),
      }).eq("id", run.id);
      resumed++;
    }
  }
  return resumed;
}

async function processStatusUpdate(
  db: ReturnType<typeof createClient>,
  status: Record<string, unknown>,
) {
  const waMessageId = String(status.id ?? "");
  if (!waMessageId) return;

  const update: Record<string, unknown> = {
    status:     String(status.status ?? ""),
    updated_at: new Date().toISOString(),
  };

  const errors = status.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    update.error = errors;
  }

  const { error } = await db
    .from("messages")
    .update(update)
    .eq("wa_message_id", waMessageId);

  if (error) console.error("status update failed", error);

  // Auto-retry campaign sends that Meta ACCEPTED but then failed to deliver
  // (e.g. #131049 marketing frequency cap). These never hit the sender's
  // send-time retry path, so re-queue them here if the recipient has retries left.
  if (String(status.status ?? "") === "failed") {
    await requeueFailedCampaignRecipient(db, waMessageId, errors);
  }
}

// Show the "typing…" bubble in the lead's chat while the AI composes a reply,
// so a live person is not staring at silence. Meta shows it for 25 seconds or
// until we send, whichever comes first, and the AI answers in a few seconds, so
// it dismisses itself naturally. The same call marks their message read (blue
// ticks), which is exactly what a person replying would do anyway.
// Fire-and-forget: a cosmetic touch must never delay or break the actual reply.
async function showTyping(waMessageId: string) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID || !waMessageId) return;
  try {
    const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${WHATSAPP_TOKEN}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: waMessageId,
        typing_indicator: { type: "text" },
      }),
    });
    if (!res.ok) console.error("typing indicator rejected", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("typing indicator failed", e);
  }
}

// Retries are scheduled for the NEXT day at 00:05 IST — matches campaign-run.
const IST_OFFSET_MS = 330 * 60 * 1000; // +05:30
function nextRetryAtISO(): string {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const y = nowIST.getUTCFullYear(), mo = nowIST.getUTCMonth(), d = nowIST.getUTCDate();
  return new Date(Date.UTC(y, mo, d + 1, 0, 5, 0) - IST_OFFSET_MS).toISOString();
}

async function requeueFailedCampaignRecipient(
  db: ReturnType<typeof createClient>,
  waMessageId: string,
  errors: unknown,
) {
  // Is this failed message a campaign send?
  const { data: r } = await db
    .from("campaign_recipients")
    .select("id, campaign_id, attempts, max_attempts")
    .eq("wa_message_id", waMessageId)
    .maybeSingle();
  if (!r) return; // not a campaign message — nothing to do

  const attempts = (r.attempts as number) || 0;
  const maxAttempts = (r.max_attempts as number) || 1;

  const e = Array.isArray(errors) && errors.length ? (errors[0] as Record<string, unknown>) : null;
  const code = (e?.code as number) ?? null;
  const detail =
    ((e?.error_data as Record<string, unknown>)?.details as string) ||
    (e?.title as string) || (e?.message as string) || "delivery failed";
  const reason = code ? `${detail} (#${code})` : detail;

  if (attempts >= maxAttempts) {
    // Out of retry budget — settle as permanently failed.
    await db.from("campaign_recipients").update({ status: "failed", error: reason }).eq("id", r.id);
    return;
  }

  // Schedule the next attempt with backoff, clear the stale message link so the
  // recipient shows as "retrying" (not failed) while it waits, and re-open the
  // campaign so the cron sender picks it up. Clearing wa_message_id also makes
  // this idempotent: duplicate status webhooks won't find the row again.
  const next = nextRetryAtISO();
  await db.from("campaign_recipients")
    .update({ status: "retry", next_attempt_at: next, error: reason, wa_message_id: null })
    .eq("id", r.id);
  await db.from("campaigns").update({ status: "sending" }).eq("id", r.campaign_id).eq("status", "completed");
}

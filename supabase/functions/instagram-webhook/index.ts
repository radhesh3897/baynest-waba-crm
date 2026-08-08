// instagram-webhook — public, no JWT required.
// Deploy with: supabase functions deploy instagram-webhook --no-verify-jwt
//
// Receives Instagram Direct events (object: "instagram") and mirrors them into
// the same contacts / conversations / messages tables the WhatsApp inbox uses,
// tagged channel = 'instagram'. Flow enrolment goes through the very same
// enroll_into_flows() the WhatsApp side uses, so one automation engine drives
// both channels.
//
// Kept separate from whatsapp-webhook on purpose: Meta lets each webhook OBJECT
// have its own callback URL, and the two payload shapes have nothing in common
// (WhatsApp: entry[].changes[].value.messages, Instagram: entry[].messaging[]).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const VERIFY_TOKEN     = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_SECRET       = Deno.env.get("META_APP_SECRET") ?? "";
const META_TOKEN       = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const META_API_VERSION = Deno.env.get("META_API_VERSION") ?? "v21.0";

const ENFORCE_SIGNATURE = true;


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
    if (expected.length !== header.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
    return diff === 0;
  } catch (e) {
    console.error("[ig] signature check error", e);
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("hub.mode") === "subscribe" &&
        url.searchParams.get("hub.verify_token") === VERIFY_TOKEN) {
      return new Response(url.searchParams.get("hub.challenge"), { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    const raw = await req.text();
    if (ENFORCE_SIGNATURE && !(await signatureValid(raw, req.headers.get("x-hub-signature-256")))) {
      console.warn("[ig] rejected: invalid signature");
      return new Response("Forbidden", { status: 401 });
    }
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return new Response("Bad Request", { status: 400 }); }

    // 200 immediately, real work after — Meta retries anything slow, and without
    // waitUntil the isolate can be reclaimed mid-flight.
    const work = processIg(body).catch(e => console.error("[ig] process failed", e));
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    return new Response("OK", { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
});

// ── Page token (Instagram sends are authorised with the linked Page's token) ──
let _pageToken = "";
async function pageToken(db: ReturnType<typeof createClient>): Promise<string> {
  if (_pageToken) return _pageToken;
  const { data: s } = await db.from("app_settings").select("fb_page_id").eq("id", 1).maybeSingle();
  const pageId = s?.fb_page_id;
  if (!pageId) throw new Error("app_settings.fb_page_id is not set");
  const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${pageId}?fields=access_token&access_token=${META_TOKEN}`);
  const j = await res.json().catch(() => ({}));
  const t = (j as Record<string, unknown>).access_token as string;
  if (!t) throw new Error(`could not derive page token: ${JSON.stringify(j)}`);
  _pageToken = t;
  return t;
}

async function processIg(body: Record<string, unknown>) {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  await db.from("webhook_events").insert({
    event_type: "instagram", raw: body, received_at: new Date().toISOString(),
  });

  const { data: settings } = await db.from("app_settings")
    .select("ig_enabled, ig_user_id").eq("id", 1).maybeSingle();
  if (settings && settings.ig_enabled === false) {
    console.log("[ig] ig_enabled is off; event logged but not processed");
    return;
  }
  const myIgId = String(settings?.ig_user_id ?? "");

  for (const entry of ((body.entry as Record<string, unknown>[]) ?? [])) {
    // Direct messages, postbacks, reactions, reads.
    for (const ev of ((entry.messaging as Record<string, unknown>[]) ?? [])) {
      try { await handleMessagingEvent(db, ev, myIgId); }
      catch (e) { console.error("[ig] messaging event failed", e); }
    }
    // Comments on posts/reels (the hook for private-reply automations).
    for (const ch of ((entry.changes as Record<string, unknown>[]) ?? [])) {
      try { await handleChange(db, ch); }
      catch (e) { console.error("[ig] change event failed", e); }
    }
  }

  await db.from("webhook_events").update({ processed: true })
    .eq("raw->>'entry'", JSON.stringify(body.entry));
}

// ── Contact identity ─────────────────────────────────────────────────────────
async function upsertIgContact(
  db: ReturnType<typeof createClient>, igsid: string,
): Promise<Record<string, unknown>> {
  const { data: found } = await db.from("contacts")
    .select("id, ig_id, ig_username, profile_name").eq("ig_id", igsid).maybeSingle();
  if (found) return found;

  // New thread: pull the handle so the inbox shows @name, not a numeric id.
  let username = "", name = "";
  try {
    const t = await pageToken(db);
    const r = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${igsid}?fields=name,username&access_token=${t}`);
    const j = await r.json().catch(() => ({})) as Record<string, unknown>;
    username = String(j.username ?? "");
    name = String(j.name ?? "");
  } catch (e) {
    // Profile lookup is best-effort: never lose the message over it.
    console.error("[ig] profile lookup failed", e);
  }

  const { data: created, error } = await db.from("contacts").insert({
    ig_id: igsid,
    ig_username: username || null,
    profile_name: name || (username ? `@${username}` : `Instagram ${igsid.slice(-6)}`),
    source: "Instagram DM",
    source_type: "instagram",
    lead_status: "New",
  }).select("id, ig_id, ig_username, profile_name").single();
  if (error) throw new Error(`contact insert failed: ${error.message}`);
  return created;
}

async function getConversation(db: ReturnType<typeof createClient>, contactId: string) {
  const { data: existing } = await db.from("conversations")
    .select("id").eq("contact_id", contactId).eq("channel", "instagram").maybeSingle();
  if (existing) return existing.id as string;
  const { data: created, error } = await db.from("conversations")
    .insert({ contact_id: contactId, channel: "instagram", status: "open" })
    .select("id").single();
  if (error) throw new Error(`conversation insert failed: ${error.message}`);
  return created.id as string;
}

// ── Messaging events ─────────────────────────────────────────────────────────
async function handleMessagingEvent(
  db: ReturnType<typeof createClient>, ev: Record<string, unknown>, myIgId: string,
) {
  const senderId = String((ev.sender as Record<string, unknown>)?.id ?? "");
  const recipientId = String((ev.recipient as Record<string, unknown>)?.id ?? "");
  const msg = ev.message as Record<string, unknown> | undefined;
  const postback = ev.postback as Record<string, unknown> | undefined;

  // Echoes are our OWN messages (including ones staff sent from the Instagram
  // app). Record them so the inbox matches reality instead of showing a gap.
  const isEcho = msg?.is_echo === true;
  const igsid = isEcho ? recipientId : senderId;
  if (!igsid || (myIgId && igsid === myIgId)) return;

  // Reactions / read receipts carry no content to store.
  if (!msg && !postback) {
    if (ev.read || ev.reaction) console.log("[ig] read/reaction event ignored");
    return;
  }
  if (msg?.is_deleted === true) return;

  const contact = await upsertIgContact(db, igsid);
  const contactId = contact.id as string;
  const conversationId = await getConversation(db, contactId);

  // Text can arrive as a message, a quick-reply payload, or a button postback.
  let text = String(msg?.text ?? postback?.title ?? "");
  const quickReply = (msg?.quick_reply as Record<string, unknown>)?.payload
    ?? postback?.payload ?? null;

  // Attachments: images, video, audio, shares, and story mentions/replies.
  const attachments = (msg?.attachments as Record<string, unknown>[]) ?? [];
  let type = "text";
  let mediaUrl: string | null = null;
  if (attachments.length > 0) {
    const a = attachments[0];
    type = String(a.type ?? "attachment");
    mediaUrl = String(((a.payload as Record<string, unknown>)?.url) ?? "") || null;
    if (!text) text = type === "story_mention" ? "(mentioned you in a story)" : `(${type})`;
  }

  const direction = isEcho ? "out" : "in";
  const mid = String(msg?.mid ?? `pb_${ev.timestamp ?? Date.now()}`);

  // Meta re-delivers webhooks; the message id makes this idempotent.
  const { data: dupe } = await db.from("messages")
    .select("id").eq("wa_message_id", mid).maybeSingle();
  if (dupe) { console.log("[ig] duplicate message", mid); return; }

  await db.from("messages").insert({
    conversation_id: conversationId,
    contact_id: contactId,
    channel: "instagram",
    wa_message_id: mid,
    direction,
    type,
    body: text || null,
    media_url: mediaUrl,
    status: direction === "in" ? "received" : "sent",
    payload: { ...(msg ?? {}), ...(postback ? { postback } : {}), referral: ev.referral ?? null },
  });

  // No conversation bookkeeping here on purpose: the handle_new_message trigger
  // already moves last_message_at, bumps unread_count, refreshes the 24h window
  // and stamps contacts.last_inbound_at. Doing it again here double-counted
  // unread (a single DM showed as 2).
  const nowIso = new Date().toISOString();

  if (direction !== "in") return;

  // ── Automation ──
  // An ad that opens a DM arrives with a referral; treat it as its own trigger
  // so "came from an ad" can be handled differently to an organic DM.
  const fromAd = !!ev.referral || !!(msg?.referral);
  const triggers = ["ig_message"];
  if (fromAd) triggers.push("ig_ad_referral");
  if (quickReply) triggers.push("ig_postback");
  if (type === "story_mention") triggers.push("ig_story_mention");
  if (type === "story_reply") triggers.push("ig_story_reply");

  for (const t of triggers) {
    try { await db.rpc("enroll_into_flows", { p_contact_id: contactId, p_trigger: t, p_text: text }); }
    catch (e) { console.error(`[ig] enroll ${t} failed`, e); }
  }
  // Keyword triggers match on the message text (the RPC does the matching).
  try { await db.rpc("enroll_into_flows", { p_contact_id: contactId, p_trigger: "ig_keyword", p_text: text }); }
  catch (e) { console.error("[ig] enroll ig_keyword failed", e); }

  // Resume any flow waiting on this person, branching on which quick reply
  // they tapped (same btn- edge convention the WhatsApp side uses).
  try { await advanceFlowsOnReply(db, contactId, text, quickReply ? String(quickReply) : null); }
  catch (e) { console.error("[ig] resume waiting runs failed", e); }
}

async function advanceFlowsOnReply(
  db: ReturnType<typeof createClient>,
  contactId: string,
  replyText: string,
  tappedPayload: string | null,
) {
  const { data: runs } = await db.from("flow_runs")
    .select("id, flow_id, current_node_key")
    .eq("contact_id", contactId).eq("status", "waiting");
  if (!runs?.length) return;

  // A tapped quick reply carries its label as the payload; free text falls
  // back to the message body.
  const answer = (tappedPayload ?? replyText ?? "").trim().toLowerCase();
  const nowIso = new Date().toISOString();

  for (const run of runs) {
    const { data: node } = await db.from("flow_nodes")
      .select("type").eq("flow_id", run.flow_id).eq("node_key", run.current_node_key).maybeSingle();
    if (!node) continue;

    const { data: edges } = await db.from("flow_edges")
      .select("source_handle, source_button, target_node_key")
      .eq("flow_id", run.flow_id).eq("source_node_key", run.current_node_key);
    if (!edges?.length) continue;

    let target: string | null = null;
    if (node.type === "igButtons" || node.type === "sendTemplate") {
      target = edges.find(e => (e.source_button ?? "").trim().toLowerCase() === answer)?.target_node_key ?? null;
    } else if (node.type === "waitReply") {
      const want = tappedPayload ? "button" : "text";
      target = (edges.find(e => e.source_handle === want) ?? edges[0])?.target_node_key ?? null;
    }
    if (!target) continue;

    await db.from("flow_runs").update({
      current_node_key: target, status: "active",
      next_run_at: nowIso, last_reply: replyText, updated_at: nowIso,
    }).eq("id", run.id);
  }
}

// ── Comment events (field: "comments") ───────────────────────────────────────
// Stored so a flow can react to them. A public reply or a private reply is sent
// by process-flows, not here, so all outbound behaviour stays in one place.
async function handleChange(db: ReturnType<typeof createClient>, ch: Record<string, unknown>) {
  if (ch.field !== "comments") return;
  const v = (ch.value as Record<string, unknown>) ?? {};
  const from = (v.from as Record<string, unknown>) ?? {};
  const igsid = String(from.id ?? "");
  const text = String(v.text ?? "");
  const commentId = String(v.id ?? "");
  if (!igsid || !commentId) return;

  const contact = await upsertIgContact(db, igsid);
  const contactId = contact.id as string;

  // Remember the comment id: a private reply is only valid against it, and only
  // for 7 days.
  const { data: c } = await db.from("contacts").select("attributes").eq("id", contactId).maybeSingle();
  await db.from("contacts").update({
    attributes: {
      ...((c?.attributes as Record<string, unknown>) ?? {}),
      last_comment_id: commentId,
      last_comment_text: text,
      last_comment_at: new Date().toISOString(),
    },
  }).eq("id", contactId);

  for (const t of ["ig_comment", "ig_comment_keyword"]) {
    try { await db.rpc("enroll_into_flows", { p_contact_id: contactId, p_trigger: t, p_text: text }); }
    catch (e) { console.error(`[ig] enroll ${t} failed`, e); }
  }
}

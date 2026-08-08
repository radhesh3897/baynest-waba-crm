// send-media — sends an image/document to a WhatsApp contact by public link.
// The frontend uploads the file to the public 'wa-media' Storage bucket and passes
// the public URL here; Meta fetches the file from that URL. verify_jwt = true.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN    = Deno.env.get("WHATSAPP_TOKEN")!;
const PHONE_NUMBER_ID   = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const META_API_VERSION  = Deno.env.get("META_API_VERSION") ?? "v21.0";
const META_URL = `https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  // Resolve caller (for sent_by)
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let callerUserId: string | null = null;
  if (token && token !== SERVICE_ROLE) {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error } = await anon.auth.getUser(token);
    if (error || !user) return json({ error: "Unauthorized" }, 401);
    callerUserId = user.id;
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const wa_id = String(body.wa_id ?? "");
  const mediaUrl = String(body.media_url ?? "");
  const mediaType = String(body.media_type ?? "image");
  const caption = (body.caption as string) || "";
  const filename = (body.filename as string) || "";

  if (!wa_id || !mediaUrl) return json({ error: "wa_id and media_url are required" }, 400);
  if (!["image", "document", "video"].includes(mediaType)) return json({ error: "Unsupported media type" }, 422);

  // Only allow links to our own public Storage bucket — prevents an authenticated
  // user from making the business number deliver arbitrary attacker-hosted URLs.
  const allowedPrefix = `${SUPABASE_URL}/storage/v1/object/public/`;
  if (!mediaUrl.startsWith(allowedPrefix)) {
    return json({ error: "media_url must be an uploaded file in this project's storage" }, 422);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const normalised = wa_id.startsWith("+") ? wa_id : "+" + wa_id;

  const { data: contact } = await db.from("contacts").select("id").eq("wa_id", normalised).maybeSingle();
  if (!contact) return json({ error: "Contact not found for " + normalised }, 404);

  const { data: conversation } = await db.from("conversations").select("id, window_expires_at").eq("contact_id", contact.id).eq("channel", "whatsapp").maybeSingle();
  if (!conversation) return json({ error: "No conversation found for this contact" }, 404);

  const expires = conversation.window_expires_at ? new Date(conversation.window_expires_at) : new Date(0);
  if (expires <= new Date()) {
    return json({ error: "This contact's 24-hour reply window has closed — send an approved template to re-open the chat." }, 422);
  }

  const mediaObj: Record<string, unknown> = { link: mediaUrl };
  if (mediaType !== "document") mediaObj.caption = caption || undefined;
  else { mediaObj.caption = caption || undefined; if (filename) mediaObj.filename = filename; }

  const metaPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalised,
    type: mediaType,
    [mediaType]: mediaObj,
  };

  const metaRes = await fetch(META_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${WHATSAPP_TOKEN}` },
    body: JSON.stringify(metaPayload),
  });
  const metaJson = await metaRes.json().catch(() => ({}));
  if (!metaRes.ok) {
    const e = (metaJson as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
    const msg = (e?.error_user_msg as string) || (e?.message as string) || "Meta API error";
    console.error("send-media Meta error", metaRes.status, metaJson);
    return json({ error: msg, status: metaRes.status, detail: metaJson }, 502);
  }

  const waMessageId = ((metaJson?.messages as unknown[])?.[0] as Record<string, unknown>)?.id as string ?? null;

  const { data: newMsg, error: insertErr } = await db.from("messages").insert({
    conversation_id: conversation.id,
    contact_id: contact.id,
    wa_message_id: waMessageId,
    direction: "out",
    type: mediaType,
    body: caption || null,
    media_url: mediaUrl,
    media_filename: filename || null,
    payload: metaPayload,
    status: "sent",
    sent_by: callerUserId,
  }).select("id, created_at").single();

  if (insertErr) { console.error("media message insert failed", insertErr); return json({ error: "Sent to Meta but failed to save", detail: insertErr }, 500); }
  return json({ ok: true, message: newMsg });
});

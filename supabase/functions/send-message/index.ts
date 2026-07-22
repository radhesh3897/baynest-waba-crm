// send-message — requires valid Supabase JWT (user or service role)
// Deploy with: supabase functions deploy send-message

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY  = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN     = Deno.env.get("WHATSAPP_TOKEN")!;
const PHONE_NUMBER_ID    = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const META_API_VERSION   = Deno.env.get("META_API_VERSION") ?? "v21.0";

const META_URL = `https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  // ── Resolve caller ───────────────────────────────────────────
  // Supabase passes the Authorization header through even without verify_jwt.
  // We validate it ourselves so we can extract the user ID for sent_by.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  let callerUserId: string | null = null;
  if (token && token !== SERVICE_ROLE) {
    // User JWT — validate against Supabase auth
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
    if (authErr || !user) {
      return json({ error: "Unauthorized" }, 401);
    }
    callerUserId = user.id;
  }
  // Service-role calls (from automation/other edge functions) skip user auth;
  // callerUserId stays null and sent_by will be null in the DB.

  // ── Parse request body ───────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { wa_id, type, text, template } = body as {
    wa_id:     string;
    type:      "text" | "template";
    text?:     string;
    template?: { name: string; language?: string; components?: unknown[] };
  };

  if (!wa_id || !type) {
    return json({ error: "wa_id and type are required" }, 400);
  }
  if (type === "text" && !text) {
    return json({ error: "text is required when type is 'text'" }, 400);
  }
  if (type === "template" && !template?.name) {
    return json({ error: "template.name is required when type is 'template'" }, 400);
  }

  // ── Look up contact + conversation (service role, bypasses RLS) ──
  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  const normalised = wa_id.startsWith("+") ? wa_id : "+" + wa_id;

  const { data: contact, error: contactErr } = await db
    .from("contacts")
    .select("id")
    .eq("wa_id", normalised)
    .maybeSingle();

  if (contactErr) return json({ error: "DB error", detail: contactErr }, 500);
  if (!contact)   return json({ error: "Contact not found for wa_id: " + normalised }, 404);

  // Human takeover: if a real logged-in agent (not the service role) is sending,
  // hand this chat off from the AI qualifier so it stops auto-replying. Only
  // flips an actively-qualifying contact — leaves 'done'/'off' untouched.
  if (callerUserId) {
    await db.from("contacts")
      .update({ ai_status: "off" })
      .eq("id", contact.id)
      .eq("ai_status", "active");
  }

  const { data: conversation, error: convErr } = await db
    .from("conversations")
    .select("id, window_expires_at")
    .eq("contact_id", contact.id)
    .maybeSingle();

  if (convErr)       return json({ error: "DB error", detail: convErr }, 500);
  if (!conversation) return json({ error: "No conversation found for this contact" }, 404);

  // ── 24-hour window check for plain text ─────────────────────
  if (type === "text") {
    const expires = conversation.window_expires_at
      ? new Date(conversation.window_expires_at)
      : new Date(0);

    if (expires <= new Date()) {
      return json({
        error: "outside 24h window — use a template",
        window_expired_at: conversation.window_expires_at ?? null,
      }, 422);
    }
  }

  // ── Build Meta API payload ───────────────────────────────────
  let metaPayload: Record<string, unknown>;

  if (type === "text") {
    metaPayload = {
      messaging_product: "whatsapp",
      recipient_type:    "individual",
      to:                normalised,
      type:              "text",
      text: { preview_url: false, body: text },
    };
  } else {
    metaPayload = {
      messaging_product: "whatsapp",
      to:                normalised,
      type:              "template",
      template: {
        name:     template!.name,
        language: { code: template!.language ?? "en" },
        components: template!.components ?? [],
      },
    };
  }

  // ── Call Meta Graph API ──────────────────────────────────────
  const metaRes = await fetch(META_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify(metaPayload),
  });

  if (!metaRes.ok) {
    const errBody = await metaRes.json().catch(() => ({}));
    console.error("Meta API error", metaRes.status, errBody);
    const e = (errBody as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
    const msg = (e?.error_user_msg as string) || (e?.message as string) || "Meta API error";
    return json({ error: msg, status: metaRes.status, detail: errBody }, 502);
  }

  const metaJson = await metaRes.json() as Record<string, unknown>;
  const waMessageId = ((metaJson?.messages as unknown[])?.[0] as Record<string, unknown>)?.id as string ?? null;

  // ── Persist outbound message ─────────────────────────────────
  const { data: newMsg, error: insertErr } = await db
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      contact_id:      contact.id,
      wa_message_id:   waMessageId,
      direction:       "out",
      type,
      body:            type === "text" ? text : null,
      template_name:   type === "template" ? template!.name : null,
      payload:         metaPayload,
      status:          "sent",
      sent_by:         callerUserId,
    })
    .select("id, wa_message_id, created_at")
    .single();

  if (insertErr) {
    console.error("message insert failed", insertErr);
    return json({ error: "Message sent to Meta but failed to save", detail: insertErr }, 500);
  }

  return json({ ok: true, message: newMsg });
});

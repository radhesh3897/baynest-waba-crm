// instagram-send — sends an Instagram Direct message, a private reply to a
// comment, or a public comment reply, and records the result in `messages`.
//
// Callers: the Inbox (a logged-in user replying by hand) and process-flows
// (service role, running an automation). Deploy with verify_jwt = false;
// authorize() enforces access.
//
// Endpoint shape is Meta's: POST /{v}/me/messages with the linked PAGE token,
// recipient addressed by Instagram-scoped ID (IGSID).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_TOKEN        = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const META_API_VERSION  = Deno.env.get("META_API_VERSION") ?? "v21.0";

// Meta rejects Instagram DMs over 1000 characters.
const MAX_TEXT = 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

async function authorize(req: Request): Promise<{ userId: string | null } | Response> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token === SUPABASE_ANON_KEY) return json({ error: "Unauthorized" }, 401);
  if (token === SERVICE_ROLE) return { userId: null };
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) return json({ error: "Unauthorized" }, 401);
  return { userId: user.id };
}

let _pageToken = "";
async function pageToken(db: ReturnType<typeof createClient>): Promise<string> {
  if (_pageToken) return _pageToken;
  const { data: s } = await db.from("app_settings").select("fb_page_id").eq("id", 1).maybeSingle();
  if (!s?.fb_page_id) throw new Error("app_settings.fb_page_id is not set");
  const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${s.fb_page_id}?fields=access_token&access_token=${META_TOKEN}`);
  const j = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!j.access_token) throw new Error(`could not derive page token: ${JSON.stringify(j)}`);
  _pageToken = String(j.access_token);
  return _pageToken;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const token = await pageToken(db);

    // ── Resolve who we are talking to ──
    let contactId = String(body.contact_id ?? "");
    let igsid = String(body.igsid ?? "");
    if (contactId && !igsid) {
      const { data: c } = await db.from("contacts").select("ig_id").eq("id", contactId).maybeSingle();
      igsid = String(c?.ig_id ?? "");
    } else if (igsid && !contactId) {
      const { data: c } = await db.from("contacts").select("id").eq("ig_id", igsid).maybeSingle();
      contactId = String(c?.id ?? "");
    }

    // ── Public reply to a comment (no DM window involved) ──
    if (body.comment_reply_to) {
      const res = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${body.comment_reply_to}/replies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: String(body.text ?? ""), access_token: token }),
        });
      const j = await res.json().catch(() => ({}));
      return json({ ok: res.ok, kind: "comment_reply", response: j }, res.ok ? 200 : 502);
    }

    if (!igsid) return json({ error: "No Instagram id for this contact" }, 422);

    // ── Typing indicator / mark seen ──
    if (body.sender_action) {
      const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/me/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: igsid }, sender_action: body.sender_action, access_token: token }),
      });
      return json({ ok: res.ok, response: await res.json().catch(() => ({})) }, res.ok ? 200 : 502);
    }

    const text = String(body.text ?? "").slice(0, MAX_TEXT);
    const quickReplies = (body.quick_replies as string[]) ?? [];
    const imageUrl = String(body.image_url ?? "");

    // ── Build the message payload ──
    const message: Record<string, unknown> = {};
    if (imageUrl) {
      message.attachment = { type: "image", payload: { url: imageUrl } };
    } else if ((body.buttons as unknown[])?.length) {
      // Button template: up to 3 buttons, each a web link or a postback.
      message.attachment = {
        type: "template",
        payload: {
          template_type: "button",
          text: text || " ",
          buttons: (body.buttons as Record<string, unknown>[]).slice(0, 3).map(b =>
            b.url
              ? { type: "web_url", url: b.url, title: String(b.title ?? "Open") }
              : { type: "postback", title: String(b.title ?? "OK"), payload: String(b.payload ?? b.title ?? "OK") }),
        },
      };
    } else {
      if (!text) return json({ error: "Nothing to send" }, 422);
      message.text = text;
    }
    if (quickReplies.length) {
      message.quick_replies = quickReplies.slice(0, 13).map(q => ({
        content_type: "text", title: String(q).slice(0, 20), payload: String(q).slice(0, 1000),
      }));
    }

    // ── Private reply to a comment: the one way to open a NEW thread ──
    // Valid for 7 days after the comment, and only once per comment.
    let url = `https://graph.facebook.com/${META_API_VERSION}/me/messages`;
    const payload: Record<string, unknown> = {
      recipient: body.private_reply_to
        ? { comment_id: String(body.private_reply_to) }
        : { id: igsid },
      message,
      access_token: token,
    };
    // Outside 24h a human may still reply for up to 7 days with this tag.
    if (body.human_agent === true) {
      payload.messaging_type = "MESSAGE_TAG";
      payload.tag = "HUMAN_AGENT";
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const out = await res.json().catch(() => ({})) as Record<string, unknown>;

    // ── Record it in the inbox either way, so failures are visible ──
    if (contactId) {
      const { data: conv } = await db.from("conversations")
        .select("id").eq("contact_id", contactId).eq("channel", "instagram").maybeSingle();
      let conversationId = conv?.id as string | undefined;
      if (!conversationId) {
        const { data: created } = await db.from("conversations")
          .insert({ contact_id: contactId, channel: "instagram", status: "open" })
          .select("id").single();
        conversationId = created?.id as string;
      }
      if (conversationId) {
        await db.from("messages").insert({
          conversation_id: conversationId,
          contact_id: contactId,
          channel: "instagram",
          wa_message_id: (out.message_id as string) ?? null,
          direction: "out",
          type: imageUrl ? "image" : "text",
          body: text || null,
          media_url: imageUrl || null,
          status: res.ok ? "sent" : "failed",
          error: res.ok ? null : (out.error ?? out),
          sent_by: auth.userId,
          flow_id: (body.flow_id as string) ?? null,
          payload: message,
        });
        // last_message_at is moved by the handle_new_message trigger.
      }
    }

    if (!res.ok) {
      const err = out.error as Record<string, unknown> | undefined;
      return json({
        ok: false,
        error: (err?.error_user_msg as string) || (err?.message as string) || "Instagram rejected the message",
        code: err?.code, detail: out,
      }, 502);
    }
    return json({ ok: true, message_id: out.message_id, recipient_id: out.recipient_id });
  } catch (e) {
    console.error("[ig-send]", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

// fetch-inbound-media — pulls an inbound WhatsApp attachment off Meta and stores
// it, so the team can actually open it in the inbox.
//
// Why this exists: a webhook for a voice note or photo carries only a media ID.
// The `url` in the payload is useless to a browser twice over: it needs our
// access token as a bearer, and it expires within minutes. Meta also drops the
// media itself after ~30 days. So we fetch it once, server-side, and keep our
// own copy.
//
// Meta needs two hops:
//   1. GET /{media-id}          -> { url, mime_type, file_size }
//   2. GET that url (with token) -> the actual bytes
// Then we upload to Storage and write the public URL onto the message row.
//
// POST { message_id }  ->  { ok, media_url }
// Idempotent: a message that already has a media_url is returned as-is, so a
// retry (or a duplicate webhook) never re-downloads or duplicates a file.
//
// Auth: fail CLOSED. Service role or the cron secret only. Deploy verify_jwt = false.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET      = Deno.env.get("CRON_SECRET") ?? "";
const WHATSAPP_TOKEN   = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const META_API_VERSION = Deno.env.get("META_API_VERSION") ?? "v21.0";
const BUCKET = "wa-media";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// WhatsApp nests the media object under a key named after the message type.
const MEDIA_TYPES = ["audio", "voice", "image", "video", "document", "sticker"];

const EXT: Record<string, string> = {
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/amr": "amr", "audio/aac": "aac",
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/3gpp": "3gp",
  "application/pdf": "pdf",
};
// Meta reports mime types like "audio/ogg; codecs=opus" — keep only the type.
const extFor = (mime: string) => EXT[(mime || "").split(";")[0].trim()] ?? "bin";

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const secret = req.headers.get("x-cron-secret") ?? "";
  const authed =
    (SERVICE_ROLE !== "" && bearer === SERVICE_ROLE) ||
    (CRON_SECRET !== "" && secret === CRON_SECRET);
  if (!authed) return json({ error: "Unauthorized" }, 401);
  if (!WHATSAPP_TOKEN) return json({ error: "WHATSAPP_TOKEN not configured" }, 500);

  const { message_id } = await req.json().catch(() => ({}));
  if (!message_id) return json({ error: "message_id is required" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: msg } = await db
    .from("messages").select("id, type, payload, media_url").eq("id", message_id).maybeSingle();
  if (!msg) return json({ error: "message not found" }, 404);
  // Already fetched. Never download the same attachment twice.
  if (msg.media_url) return json({ ok: true, media_url: msg.media_url, cached: true });

  const payload = (msg.payload ?? {}) as Record<string, unknown>;
  const key = MEDIA_TYPES.find((t) => payload[t]);
  const media = key ? (payload[key] as Record<string, unknown>) : null;
  const mediaId = media?.id ? String(media.id) : "";
  if (!mediaId) return json({ error: "message carries no media id" }, 400);

  // Hop 1: media id -> a short-lived download url.
  const metaRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${mediaId}`, {
    headers: { "Authorization": `Bearer ${WHATSAPP_TOKEN}` },
  });
  const meta = await metaRes.json().catch(() => ({}));
  if (!metaRes.ok || !meta?.url) {
    console.error("[media] lookup failed", mediaId, metaRes.status, meta);
    return json({ error: "media lookup failed", detail: meta }, 502);
  }

  // Hop 2: the bytes. This host also demands the bearer token.
  const binRes = await fetch(String(meta.url), {
    headers: { "Authorization": `Bearer ${WHATSAPP_TOKEN}` },
  });
  if (!binRes.ok) {
    console.error("[media] download failed", mediaId, binRes.status);
    return json({ error: `media download failed ${binRes.status}` }, 502);
  }
  const bytes = new Uint8Array(await binRes.arrayBuffer());

  const mime = String(meta.mime_type ?? media?.mime_type ?? "application/octet-stream");
  const filename = String(media?.filename ?? "") ||
    `${String(msg.type)}-${String(msg.id).slice(0, 8)}.${extFor(mime)}`;
  // Path is keyed by the message id: unguessable, and stable across retries.
  const path = `inbound/${msg.id}.${extFor(mime)}`;

  const { error: upErr } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime.split(";")[0].trim(),
    upsert: true,
  });
  if (upErr) {
    console.error("[media] upload failed", path, upErr);
    return json({ error: "upload failed", detail: upErr }, 500);
  }

  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);
  const mediaUrl = pub?.publicUrl ?? null;

  await db.from("messages")
    .update({ media_url: mediaUrl, media_filename: filename })
    .eq("id", msg.id);

  console.log("[media] stored", msg.type, path, bytes.length, "bytes");
  return json({ ok: true, media_url: mediaUrl, bytes: bytes.length, mime });
});

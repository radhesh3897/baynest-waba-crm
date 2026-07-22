// get-media-handle — uploads a sample media file to Meta's Resumable Upload API
// and returns the header_handle needed to create IMAGE/VIDEO/DOCUMENT-header and
// carousel templates. The frontend uploads the file to public storage and passes
// the URL here. Requires a logged-in user; media_url is restricted to our own
// Supabase Storage public host (no arbitrary server-side fetch / SSRF).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN    = Deno.env.get("WHATSAPP_TOKEN")!;
const META_API_VERSION  = Deno.env.get("META_API_VERSION") ?? "v21.0";
const META_APP_ID       = Deno.env.get("META_APP_ID") ?? "2186491725248120";

const MAX_BYTES = 30 * 1024 * 1024; // 30 MB cap on the sample upload

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

async function requireUser(req: Request): Promise<Response | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token === SUPABASE_ANON_KEY) return json({ error: "Unauthorized" }, 401);
  if (token === SERVICE_ROLE) return null;
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) return json({ error: "Unauthorized" }, 401);
  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const denied = await requireUser(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const mediaUrl = String(body.media_url ?? "");
  if (!mediaUrl) return json({ error: "media_url is required" }, 400);

  // SSRF guard: only fetch files from our own Supabase Storage public bucket.
  const allowedPrefix = `${SUPABASE_URL}/storage/v1/object/public/`;
  if (!mediaUrl.startsWith(allowedPrefix)) {
    return json({ error: "media_url must be a Supabase Storage public URL for this project" }, 400);
  }

  // Fetch the uploaded sample file bytes (size-capped).
  const fileRes = await fetch(mediaUrl);
  if (!fileRes.ok) return json({ error: "Could not fetch the uploaded file" }, 502);
  const declared = Number(fileRes.headers.get("content-length") ?? "0");
  if (declared && declared > MAX_BYTES) return json({ error: "File too large" }, 413);
  const buf = new Uint8Array(await fileRes.arrayBuffer());
  if (buf.length > MAX_BYTES) return json({ error: "File too large" }, 413);
  const fileType = String(body.file_type ?? fileRes.headers.get("content-type") ?? "application/octet-stream");
  const fileName = String(body.file_name ?? "sample");

  // 1) Create a resumable upload session (token via Authorization header, not URL).
  const sessRes = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${META_APP_ID}/uploads?file_name=${encodeURIComponent(fileName)}&file_length=${buf.length}&file_type=${encodeURIComponent(fileType)}`,
    { method: "POST", headers: { "Authorization": `OAuth ${WHATSAPP_TOKEN}` } },
  );
  const sessData = await sessRes.json().catch(() => ({}));
  const sessionId = (sessData as Record<string, unknown>).id as string;
  if (!sessRes.ok || !sessionId) {
    console.error("upload session failed", sessRes.status, sessData);
    return json({ error: "Could not start the Meta upload session", step: "session" }, 502);
  }

  // 2) Upload the bytes; Meta returns the file handle in `h`.
  const upRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${sessionId}`, {
    method: "POST",
    headers: { "Authorization": `OAuth ${WHATSAPP_TOKEN}`, "file_offset": "0" },
    body: buf,
  });
  const upData = await upRes.json().catch(() => ({}));
  const handle = (upData as Record<string, unknown>).h as string;
  if (!upRes.ok || !handle) {
    console.error("upload bytes failed", upRes.status, upData);
    return json({ error: "Could not upload the sample to Meta", step: "upload" }, 502);
  }

  return json({ ok: true, handle });
});

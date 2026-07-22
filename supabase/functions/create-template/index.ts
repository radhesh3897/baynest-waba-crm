// create-template — creates a WhatsApp message template on the Meta WABA, then
// records it locally (status PENDING until Meta reviews it).
// Called by an authenticated app user. Deploy with verify_jwt = true.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN    = Deno.env.get("WHATSAPP_TOKEN")!;
const WABA_ID           = Deno.env.get("WHATSAPP_WABA_ID")!;
const META_API_VERSION  = Deno.env.get("META_API_VERSION") ?? "v21.0";

// Require a genuine logged-in user. verify_jwt alone is NOT enough — the public
// anon key satisfies it — so we validate the bearer is a real Supabase user.
async function requireUser(req: Request): Promise<Response | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token === SUPABASE_ANON_KEY) return json({ error: "Unauthorized" }, 401);
  if (token === SERVICE_ROLE) return null; // internal service-role caller
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) return json({ error: "Unauthorized" }, 401);
  return null;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

function bodyText(components: unknown[]): string {
  if (!Array.isArray(components)) return "";
  const b = components.find(c => (c as Record<string, unknown>)?.type === "BODY");
  return ((b as Record<string, unknown>)?.text as string) ?? "";
}
const tidy = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "");

function quickReplyButtons(components: unknown[]): string[] {
  if (!Array.isArray(components)) return [];
  const btnComp = components.find(c => (c as Record<string, unknown>)?.type === "BUTTONS") as Record<string, unknown> | undefined;
  const btns = (btnComp?.buttons as Record<string, unknown>[]) ?? [];
  return btns.filter(b => b?.type === "QUICK_REPLY").map(b => String(b.text ?? "")).filter(Boolean);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const denied = await requireUser(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const name = String(body.name ?? "").trim();
  const language = String(body.language ?? "").trim();
  const category = String(body.category ?? "").trim().toUpperCase();
  const components = body.components as unknown[];

  // ── Validation ──
  if (!/^[a-z0-9_]+$/.test(name)) return json({ error: "Name must be lowercase letters, numbers and underscores only." }, 422);
  if (!language) return json({ error: "Language is required." }, 422);
  if (!["MARKETING", "UTILITY", "AUTHENTICATION"].includes(category)) return json({ error: "Invalid category." }, 422);
  if (!Array.isArray(components) || components.length === 0) return json({ error: "At least a body is required." }, 422);

  // ── Create on Meta ──
  const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${WHATSAPP_TOKEN}` },
    body: JSON.stringify({ name, language, category, components }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = (data as Record<string, unknown>).error as Record<string, unknown> | undefined;
    const msg = (err?.error_user_msg as string) || (err?.message as string) || "Meta rejected the template.";
    console.error("create-template Meta error", res.status, data);
    return json({ error: msg, status: res.status }, 502);
  }

  // ── Record locally so it shows immediately (PENDING until reviewed) ──
  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const status = ((data as Record<string, unknown>).status as string) || "PENDING";
  const { error: dbErr } = await db.from("templates").upsert({
    name,
    language,
    category: tidy(category),
    body: bodyText(components),
    buttons: quickReplyButtons(components),
    status: tidy(status),
  }, { onConflict: "name", ignoreDuplicates: false });
  if (dbErr) console.error("template upsert failed (created on Meta though)", dbErr);

  return json({ ok: true, id: (data as Record<string, unknown>).id, status, category });
});

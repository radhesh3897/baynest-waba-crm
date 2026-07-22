// sync-templates — pulls message templates from the Meta WABA and upserts them
// into public.templates (incl. quick-reply buttons for flow branching). Callable
// by the pg_cron auto-sync (x-cron-secret) AND a logged-in app user.
// Deploy with verify_jwt = false.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN    = Deno.env.get("WHATSAPP_TOKEN")!;
const WABA_ID           = Deno.env.get("WHATSAPP_WABA_ID")!;
const META_API_VERSION  = Deno.env.get("META_API_VERSION") ?? "v21.0";
const CRON_SECRET       = Deno.env.get("CRON_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

// Allow either the pg_cron caller (x-cron-secret) or a real logged-in user.
async function authorize(req: Request): Promise<Response | null> {
  const cron = req.headers.get("x-cron-secret");
  if (CRON_SECRET && cron === CRON_SECRET) return null;
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token === SUPABASE_ANON_KEY) return json({ error: "Unauthorized" }, 401);
  if (token === SERVICE_ROLE) return null;
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) return json({ error: "Unauthorized" }, 401);
  return null;
}

// Extract the human-readable BODY text from a template's components array.
function bodyText(components: unknown[]): string {
  if (!Array.isArray(components)) return "";
  const body = components.find(c => (c as Record<string, unknown>)?.type === "BODY");
  return (body as Record<string, unknown>)?.text as string ?? "";
}

// Quick-reply button labels — these are what create branches in the flow builder.
function quickReplyButtons(components: unknown[]): string[] {
  if (!Array.isArray(components)) return [];
  const btnComp = components.find(c => (c as Record<string, unknown>)?.type === "BUTTONS") as Record<string, unknown> | undefined;
  const btns = (btnComp?.buttons as Record<string, unknown>[]) ?? [];
  return btns.filter(b => b?.type === "QUICK_REPLY").map(b => String(b.text ?? "")).filter(Boolean);
}

// Header component: format (TEXT/IMAGE/VIDEO/DOCUMENT) + text for TEXT headers.
function headerInfo(components: unknown[]): { header_type: string; header_text: string | null } {
  if (!Array.isArray(components)) return { header_type: "NONE", header_text: null };
  const h = components.find(c => (c as Record<string, unknown>)?.type === "HEADER") as Record<string, unknown> | undefined;
  if (!h) return { header_type: "NONE", header_text: null };
  const fmt = String(h.format ?? "").toUpperCase() || "NONE";
  return { header_type: fmt, header_text: fmt === "TEXT" ? ((h.text as string) ?? null) : null };
}

function tidyStatus(s: string): string {
  if (!s) return "pending";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
function tidyCategory(c: string): string {
  if (!c) return "Utility";
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  const denied = await authorize(req);
  if (denied) return denied;

  const url = `https://graph.facebook.com/${META_API_VERSION}/${WABA_ID}/message_templates?limit=200&access_token=${WHATSAPP_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    console.error("Meta templates fetch failed", res.status, detail);
    return json({ error: "Meta API error", status: res.status }, 502);
  }

  const payload = await res.json() as { data?: Record<string, unknown>[] };
  const templates = payload.data ?? [];

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  const rows = templates.map(t => ({
    name: t.name as string,
    language: (t.language as string) ?? "en",
    category: tidyCategory(t.category as string),
    body: bodyText(t.components as unknown[]),
    buttons: quickReplyButtons(t.components as unknown[]),
    status: tidyStatus(t.status as string),
    ...headerInfo(t.components as unknown[]),
  })).filter(r => r.name);

  if (rows.length === 0) {
    return json({ ok: true, synced: 0, message: "No templates returned from Meta." });
  }

  const { error } = await db
    .from("templates")
    .upsert(rows, { onConflict: "name", ignoreDuplicates: false });

  if (error) {
    console.error("templates upsert failed", error);
    return json({ error: "DB error" }, 500);
  }

  return json({ ok: true, synced: rows.length, names: rows.map(r => r.name) });
});

// sync-forms — fetches Meta Lead Ad forms for the managed page into public.fb_forms.
// Called on a schedule by pg_cron (sends x-cron-secret) AND by the People screen's
// "Refresh forms" button (logged-in user). Deploy with verify_jwt = false.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN    = Deno.env.get("WHATSAPP_TOKEN")!;
const META_API_VERSION  = Deno.env.get("META_API_VERSION") ?? "v21.0";
const CRON_SECRET       = Deno.env.get("CRON_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const denied = await authorize(req);
  if (denied) return denied;

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Which page are we managing?
  const { data: settings } = await db.from("app_settings").select("fb_page_id, fb_page_name").eq("id", 1).maybeSingle();
  const pageId = settings?.fb_page_id;
  if (!pageId) return json({ error: "No fb_page_id set in app_settings" }, 400);

  // Derive a Page access token (system-user token + page assigned).
  const ptRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${pageId}?fields=access_token,name&access_token=${WHATSAPP_TOKEN}`);
  const ptData = await ptRes.json().catch(() => ({}));
  const pageToken = (ptData as Record<string, unknown>).access_token as string;
  const pageName = (ptData as Record<string, unknown>).name as string ?? settings?.fb_page_name ?? null;
  if (!pageToken) { console.error("derive page token failed", ptData); return json({ error: "Could not derive page token" }, 502); }

  // Upsert the page row, get its uuid (fb_forms.page_id FK).
  const { data: pageRow, error: pageErr } = await db
    .from("fb_pages")
    .upsert({ page_id: pageId, name: pageName }, { onConflict: "page_id", ignoreDuplicates: false })
    .select("id")
    .single();
  if (pageErr) { console.error("fb_pages upsert failed", pageErr); return json({ error: "fb_pages upsert failed" }, 500); }

  // Fetch all lead forms on the page.
  const formsRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${pageId}/leadgen_forms?fields=id,name,status,locale,questions&limit=200&access_token=${pageToken}`);
  const formsData = await formsRes.json().catch(() => ({}));
  if (!formsRes.ok) { console.error("Meta forms fetch failed", formsData); return json({ error: "Meta forms fetch failed" }, 502); }

  const forms = (formsData as { data?: Record<string, unknown>[] }).data ?? [];
  const rows = forms.map(f => ({
    form_id: f.id as string,
    page_id: pageRow.id,
    name: f.name as string,
    // Keep the question key/label/type so the UI + lead mapping can use them.
    fields: ((f.questions as Record<string, unknown>[]) ?? []).map(q => ({
      key: q.key, label: q.label, type: q.type,
    })),
  })).filter(r => r.form_id);

  if (rows.length === 0) return json({ ok: true, synced: 0, message: "No forms on this page." });

  const { error } = await db.from("fb_forms").upsert(rows, { onConflict: "form_id", ignoreDuplicates: false });
  if (error) { console.error("fb_forms upsert failed", error); return json({ error: "fb_forms upsert failed" }, 500); }

  return json({ ok: true, synced: rows.length, forms: rows.map(r => ({ form_id: r.form_id, name: r.name })) });
});

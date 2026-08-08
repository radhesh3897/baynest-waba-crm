// meta-page-connect — one-time (re-runnable) wiring for Meta Lead Ads retrieval.
//
// Does three things, and reports honestly on each:
//   1. Finds the Facebook Page(s) this token can manage and records the chosen
//      one in app_settings.fb_page_id (sync-forms needs it, and so does the
//      leadgen webhook when it derives a Page token).
//   2. Installs this app on the Page and subscribes it to the `leadgen` field
//      (POST /{page-id}/subscribed_apps) — this is what makes Meta actually
//      deliver a webhook the moment someone submits a lead form.
//   3. Subscribes the APP itself to the `page` object at our callback URL
//      (POST /{app-id}/subscriptions), the app-level half of the same switch.
//
// Deploy with verify_jwt = false; authorize() gates it (cron secret, service
// role, or a logged-in app user).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN    = Deno.env.get("WHATSAPP_TOKEN")!;
const META_API_VERSION  = Deno.env.get("META_API_VERSION") ?? "v21.0";
const CRON_SECRET       = Deno.env.get("CRON_SECRET") ?? "";
const APP_ID            = (Deno.env.get("META_APP_ID") ?? "").trim();
const APP_SECRET        = (Deno.env.get("META_APP_SECRET") ?? "").trim();
const VERIFY_TOKEN      = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

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

const g = (p: string) => `https://graph.facebook.com/${META_API_VERSION}/${p}`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const denied = await authorize(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const wantPageId = String(body.page_id ?? "").trim();
  const dryRun = body.dry_run === true;

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const steps: Record<string, unknown> = {};

  // ── 1. Which Pages can this token see? ────────────────────────────────────
  const accRes = await fetch(g(`me/accounts?fields=id,name,access_token,tasks&limit=50&access_token=${WHATSAPP_TOKEN}`));
  const acc = await accRes.json().catch(() => ({})) as Record<string, unknown>;
  if (!accRes.ok) return json({ error: "Could not list Pages", detail: acc }, 502);

  const pages = ((acc.data as Record<string, unknown>[]) ?? []).map(p => ({
    id: String(p.id), name: String(p.name ?? ""), token: String(p.access_token ?? ""),
  }));
  steps.pages_found = pages.map(p => ({ id: p.id, name: p.name }));
  if (pages.length === 0) {
    return json({
      error: "This token cannot manage any Facebook Page.",
      fix: "In Business Settings → Users → System Users → assign the Page to the system user with Manage Page access, then re-run.",
    }, 400);
  }

  const page = (wantPageId && pages.find(p => p.id === wantPageId)) || pages[0];
  steps.page_selected = { id: page.id, name: page.name };
  if (pages.length > 1 && !wantPageId) {
    steps.note = `More than one Page is visible; defaulted to "${page.name}". Re-run with {"page_id":"..."} to pick another.`;
  }
  if (dryRun) return json({ ok: true, dry_run: true, steps });

  // ── 2. Record it so sync-forms / the webhook can use it ───────────────────
  const { error: setErr } = await db.from("app_settings")
    .update({ fb_page_id: page.id, fb_page_name: page.name }).eq("id", 1);
  steps.app_settings = setErr ? { ok: false, error: setErr.message } : { ok: true, fb_page_id: page.id };

  await db.from("fb_pages").upsert({ page_id: page.id, name: page.name }, { onConflict: "page_id" });

  // ── 3. Install the app on the Page + subscribe to `leadgen` ───────────────
  // Uses the Page's own token — a system-user token is not accepted here.
  const subRes = await fetch(g(`${page.id}/subscribed_apps`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscribed_fields: "leadgen", access_token: page.token }),
  });
  const sub = await subRes.json().catch(() => ({}));
  steps.page_subscribed_apps = { ok: subRes.ok, response: sub };

  // Read it back — the POST returning success is not proof the field stuck.
  const verRes = await fetch(g(`${page.id}/subscribed_apps?access_token=${page.token}`));
  const ver = await verRes.json().catch(() => ({})) as Record<string, unknown>;
  const apps = (ver.data as Record<string, unknown>[]) ?? [];
  steps.leadgen_subscribed = apps.some(a =>
    ((a.subscribed_fields as string[]) ?? []).includes("leadgen"));
  steps.subscribed_fields = apps.map(a => ({ app: a.name ?? a.id, fields: a.subscribed_fields }));

  // ── 4. App-level: subscribe the app to the `page` object ──────────────────
  if (APP_ID && APP_SECRET) {
    const appToken = `${APP_ID}|${APP_SECRET}`;
    const callback = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
    const appRes = await fetch(g(`${APP_ID}/subscriptions`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        object: "page", callback_url: callback, fields: "leadgen",
        verify_token: VERIFY_TOKEN, access_token: appToken,
      }),
    });
    steps.app_subscription = { ok: appRes.ok, response: await appRes.json().catch(() => ({})) };

    const listRes = await fetch(g(`${APP_ID}/subscriptions?access_token=${appToken}`));
    const list = await listRes.json().catch(() => ({})) as Record<string, unknown>;
    steps.app_subscriptions_now = ((list.data as Record<string, unknown>[]) ?? [])
      .map(s => ({ object: s.object, fields: ((s.fields as Record<string, unknown>[]) ?? []).map(f => f.name) }));
  } else {
    steps.app_subscription = {
      ok: false,
      skipped: "META_APP_ID and/or META_APP_SECRET not set — do this step in the App Dashboard instead: Webhooks → Page → Subscribe to `leadgen`.",
    };
  }

  return json({ ok: true, page: { id: page.id, name: page.name }, steps });
});

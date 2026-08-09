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
  // probe_only: read one existing lead to prove leads_retrieval works and to
  // discover what the forms actually call their fields. Returns field NAMES
  // only — never the answers, which are a real person's contact details.
  const probeOnly = body.probe_only === true;

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

  // probe_instagram: can this token actually run an Instagram inbox? Reports the
  // linked IG account, the scopes the token carries, and whether the messaging
  // ones are present — read-only, changes nothing.
  if (body.probe_instagram === true) {
    const out: Record<string, unknown> = {};

    const igRes = await fetch(g(`${page.id}?fields=instagram_business_account{id,username,name,followers_count},connected_instagram_account{id,username}&access_token=${page.token}`));
    out.page_instagram = await igRes.json().catch(() => ({}));

    const dbgRes = await fetch(g(`debug_token?input_token=${WHATSAPP_TOKEN}&access_token=${WHATSAPP_TOKEN}`));
    const dbg = await dbgRes.json().catch(() => ({})) as Record<string, unknown>;
    const scopes = (((dbg.data as Record<string, unknown>)?.scopes) as string[]) ?? [];
    const need = ["instagram_basic", "instagram_manage_messages", "pages_manage_metadata", "pages_messaging"];
    out.token_type = (dbg.data as Record<string, unknown>)?.type;
    out.scopes_present = need.filter(s => scopes.includes(s));
    out.scopes_missing = need.filter(s => !scopes.includes(s));
    out.all_scopes = scopes;

    // What is this app already subscribed to at the app level?
    if (APP_ID && APP_SECRET) {
      const lr = await fetch(g(`${APP_ID}/subscriptions?access_token=${APP_ID}|${APP_SECRET}`));
      const lj = await lr.json().catch(() => ({})) as Record<string, unknown>;
      out.app_subscriptions = ((lj.data as Record<string, unknown>[]) ?? [])
        .map(s => ({ object: s.object, fields: ((s.fields as Record<string, unknown>[]) ?? []).map(f => f.name) }));
    }
    return json({ ok: true, probe: "instagram", page: { id: page.id, name: page.name }, ...out });
  }

  // connect_instagram: point the `instagram` webhook object at instagram-webhook
  // and record which IG account this workspace owns.
  if (body.connect_instagram === true) {
    const steps2: Record<string, unknown> = {};

    const igRes = await fetch(g(`${page.id}?fields=instagram_business_account{id,username}&access_token=${page.token}`));
    const igj = await igRes.json().catch(() => ({})) as Record<string, unknown>;
    const ig = (igj.instagram_business_account as Record<string, unknown>) ?? {};
    const igId = String(ig.id ?? "");
    const igUser = String(ig.username ?? "");
    if (!igId) return json({ ok: false, error: "No Instagram professional account is linked to this Page.", detail: igj }, 400);
    steps2.instagram_account = { id: igId, username: igUser };

    const { error: upErr } = await db.from("app_settings")
      .update({ ig_user_id: igId, ig_username: igUser }).eq("id", 1);
    steps2.app_settings = upErr ? { ok: false, error: upErr.message } : { ok: true };

    if (!APP_ID || !APP_SECRET) {
      steps2.app_subscription = { ok: false, skipped: "META_APP_ID / META_APP_SECRET not set" };
      return json({ ok: false, steps: steps2 }, 400);
    }
    const appToken = `${APP_ID}|${APP_SECRET}`;
    const callback = `${SUPABASE_URL}/functions/v1/instagram-webhook`;
    // messaging_seen and message_reactions are subscribed too so read receipts
    // and reactions can be shown later without another Meta round-trip.
    const fields = "messages,messaging_postbacks,messaging_seen,message_reactions,messaging_referral,comments";
    const subRes = await fetch(g(`${APP_ID}/subscriptions`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        object: "instagram", callback_url: callback, fields,
        verify_token: VERIFY_TOKEN, access_token: appToken,
      }),
    });
    steps2.subscribe = { ok: subRes.ok, response: await subRes.json().catch(() => ({})) };

    // Read back: a 200 on the POST is not proof the fields stuck.
    const listRes = await fetch(g(`${APP_ID}/subscriptions?access_token=${appToken}`));
    const list = await listRes.json().catch(() => ({})) as Record<string, unknown>;
    const rows = ((list.data as Record<string, unknown>[]) ?? []);
    const igSub = rows.find(r => r.object === "instagram");
    steps2.instagram_subscription = igSub
      ? { callback: igSub.callback_url, fields: ((igSub.fields as Record<string, unknown>[]) ?? []).map(f => f.name) }
      : null;
    steps2.all_objects = rows.map(r => r.object);

    return json({ ok: !!igSub, page: { id: page.id, name: page.name }, steps: steps2 });
  }

  // probe_ig_messaging: read-only proof that Instagram messaging access is
  // actually live. Listing IG conversations needs instagram_manage_messages AND
  // the "Connected Tools" toggle in the Instagram app, so a clean response is
  // real evidence rather than a guess. Returns counts only, never message text.
  if (body.probe_ig_messaging === true) {
    const out: Record<string, unknown> = {};

    // Meta requires the MESSAGING task on the Page for this token; without it
    // the API returns the same "owner disabled access" error as the Instagram
    // Connected Tools toggle, so check both before blaming the toggle.
    const accRes = await fetch(g(`me/accounts?fields=id,name,tasks&limit=25&access_token=${WHATSAPP_TOKEN}`));
    const accJ = await accRes.json().catch(() => ({})) as Record<string, unknown>;
    const thisPage = ((accJ.data as Record<string, unknown>[]) ?? []).find(p => String(p.id) === page.id);
    const tasks = (thisPage?.tasks as string[]) ?? [];
    out.page_tasks = tasks;
    out.has_messaging_task = tasks.includes("MESSAGING");

    // Does the token itself still carry the messaging scope?
    const dbg = await (await fetch(g(`debug_token?input_token=${WHATSAPP_TOKEN}&access_token=${WHATSAPP_TOKEN}`))).json().catch(() => ({})) as Record<string, unknown>;
    const scopes = (((dbg.data as Record<string, unknown>)?.scopes) as string[]) ?? [];
    out.has_manage_messages_scope = scopes.includes("instagram_manage_messages");

    // Is the Instagram account itself assigned to this system user in Business
    // Settings? The Page being assigned does not imply the IG asset is.
    const igDirect = await fetch(g(`${(await (await fetch(g(`${page.id}?fields=instagram_business_account&access_token=${page.token}`))).json().catch(() => ({})) as Record<string, unknown>)?.instagram_business_account?.["id"] ?? "0"}?fields=id,username&access_token=${WHATSAPP_TOKEN}`));
    const igDirectJ = await igDirect.json().catch(() => ({})) as Record<string, unknown>;
    out.ig_asset_readable_by_system_user = igDirect.ok;
    if (!igDirect.ok) out.ig_asset_error = (igDirectJ.error as Record<string, unknown>)?.message;

    const r = await fetch(g(`${page.id}/conversations?platform=instagram&fields=id,updated_time,message_count&limit=25&access_token=${page.token}`));
    const j = await r.json().catch(() => ({})) as Record<string, unknown>;
    out.http_ok = r.ok;
    if (!r.ok) {
      const e = (j.error as Record<string, unknown>) ?? {};
      out.error = { message: e.message, code: e.code, subcode: e.error_subcode, type: e.type };
      out.verdict = "Instagram messaging is NOT reachable yet";
    } else {
      const rows = (j.data as Record<string, unknown>[]) ?? [];
      out.conversations_visible = rows.length;
      out.most_recent = rows[0]?.updated_time ?? null;
      out.verdict = "Instagram messaging is reachable";
    }
    return json({ ok: r.ok, probe: "ig_messaging", ig: { username: "baynestrealty" }, ...out });
  }

  if (probeOnly) {
    const lr = await fetch(g(`${page.id}/leadgen_forms?fields=id,name,leads.limit(1){id,created_time,field_data}&limit=25&access_token=${page.token}`));
    const lj = await lr.json().catch(() => ({})) as Record<string, unknown>;
    if (!lr.ok) return json({ ok: false, error: "Could not read leads", detail: lj }, 502);

    const seen = new Set<string>();
    let sampled = 0;
    for (const f of ((lj.data as Record<string, unknown>[]) ?? [])) {
      for (const l of ((((f.leads as Record<string, unknown>)?.data) as Record<string, unknown>[]) ?? [])) {
        sampled++;
        for (const fd of ((l.field_data as Record<string, unknown>[]) ?? [])) seen.add(String(fd.name));
      }
    }
    return json({
      ok: true, probe: true,
      leads_readable: sampled > 0,
      leads_sampled: sampled,
      field_names: [...seen].sort(),
    });
  }

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

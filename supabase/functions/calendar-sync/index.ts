// Authenticated staff and the private retry worker mirror reminders to Manish.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { eventBody, eventId } from "./event.ts";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CALENDAR = "manish@baynestrealty.com";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 400);
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encoded = (v: unknown) => b64(new TextEncoder().encode(JSON.stringify(v)));
let cached: { token: string; expires: number } | null = null;

async function accessToken(sa: any) {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  if (!sa?.client_email || !sa?.private_key) throw new Error("Google Calendar credential is not configured.");
  const now = Math.floor(Date.now() / 1000);
  const jwt = `${encoded({ alg: "RS256", typ: "JWT" })}.${encoded({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/calendar", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const pem = sa.private_key.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(jwt));
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${jwt}.${b64(new Uint8Array(signature))}` }), signal: AbortSignal.timeout(15000) });
  const body = await res.json();
  if (!res.ok || !body.access_token) throw new Error("Google Calendar credential was rejected. Check the connection in Account Settings.");
  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

class GoogleError extends Error { constructor(public status: number, detail: string) { super(detail); } }
async function google(token: string, path: string, method = "GET", data?: unknown) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(res.status, body.error?.message || `Google Calendar returned ${res.status}.`);
  return body;
}

async function syncOne(db: any, token: string, id: string) {
  const { data: claimed, error } = await db.rpc("claim_calendar_reminder", { p_id: id });
  if (error) throw error;
  const r = claimed?.[0];
  if (!r) return { id, ok: false, pending: true, error: "Sync is already in progress. Please retry shortly." };
  const base = `/calendars/${encodeURIComponent(CALENDAR)}/events`;
  const eid = r.google_event_id || eventId(r.id);
  try {
    let patch: any;
    if (r.status !== "open") {
      try { await google(token, `${base}/${encodeURIComponent(eid)}?sendUpdates=none`, "DELETE"); }
      catch (e) { if (!(e instanceof GoogleError) || ![404, 410].includes(e.status)) throw e; }
      patch = { google_event_id: null, google_link: null };
    } else {
      let contact = null;
      if (r.contact_id) {
        const response = await db.from("contacts").select("profile_name,wa_id,lead_status").eq("id", r.contact_id).maybeSingle();
        if (response.error) throw response.error;
        contact = response.data;
      }
      const body = eventBody({ ...r, contacts: contact }, "Asia/Kolkata");
      let ev;
      if (r.google_event_id) {
        ev = await google(token, `${base}/${encodeURIComponent(eid)}?sendUpdates=none`, "PATCH", body);
      } else {
        try { ev = await google(token, `${base}?sendUpdates=none`, "POST", { ...body, id: eid }); }
        catch (e) {
          // A retry after a response was lost must update the same event.
          if (!(e instanceof GoogleError) || e.status !== 409) throw e;
          ev = await google(token, `${base}/${encodeURIComponent(eid)}?sendUpdates=none`, "PATCH", body);
        }
      }
      patch = { google_event_id: ev.id, google_link: ev.htmlLink };
    }
    const { data: saved, error: saveError } = await db.from("reminders").update({ ...patch, sync_status: "synced", sync_error: null, sync_attempts: 0 }).eq("id", id).eq("sync_revision", r.sync_revision).select("id");
    if (saveError) throw saveError;
    return { id, ok: !!saved?.length, pending: !saved?.length };
  } catch (e) {
    await db.from("reminders").update({ sync_status: "failed", sync_error: message(e), sync_attempts: r.sync_attempts + 1 }).eq("id", id).eq("sync_revision", r.sync_revision);
    return { id, ok: false, error: message(e) };
  } finally {
    await db.from("reminders").update({ sync_claimed_at: null }).eq("id", id).eq("sync_claimed_at", r.sync_claimed_at);
  }
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  const cron = req.headers.get("x-cron-secret") || "";
  if (!auth && !cron) return json({ error: "Sign in first." }, 401);
  const db = createClient(URL, KEY, { auth: { persistSession: false } });
  try {
    const { data: config, error: configError } = await db.rpc("calendar_worker_config");
    if (configError) throw new Error("Calendar worker setup is incomplete.");
    const trusted = auth === KEY || (cron.length > 20 && cron === config?.cron_secret);
    if (!trusted) {
      const { data, error } = await db.auth.getUser(auth);
      if (error || !data.user) return json({ error: "Sign in first." }, 401);
      const { data: profile } = await db.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
      if (!profile) return json({ error: "Staff access required." }, 403);
    }
    const payload = await req.json().catch(() => ({}));
    if (!trusted && !payload.reminder_id && payload.action !== "test") return json({ error: "Choose a reminder." }, 400);
    const token = await accessToken(config?.service_account);
    if (payload.action === "test") {
      const access = await google(token, `/calendars/${encodeURIComponent(CALENDAR)}/events?maxResults=1&fields=accessRole`);
      if (!["writer", "owner"].includes(access.accessRole)) throw new Error("Share Manish's calendar with dfy-crm-baynest@dfy-waba-crm.iam.gserviceaccount.com using Make changes to events.");
      await db.from("google_calendar_account").update({ calendar_id: CALENDAR, service_account_email: config.service_account.client_email, verified_at: new Date().toISOString(), last_error: null }).eq("singleton", true);
      return json({ ok: true, calendar_id: CALENDAR });
    }
    let ids: string[];
    if (payload.reminder_id) {
      if (!/^[0-9a-f-]{36}$/i.test(payload.reminder_id)) return json({ error: "Invalid reminder." }, 400);
      ids = [payload.reminder_id];
    } else {
      const { data, error } = await db.from("reminders").select("id").in("sync_status", ["pending", "failed"]).lt("sync_attempts", 5).or(`status.neq.open,due_at.gt.${new Date().toISOString()}`).order("due_at").limit(10);
      if (error) throw error;
      ids = (data || []).map((r: any) => r.id);
    }
    const results = [];
    for (const id of ids) results.push(await syncOne(db, token, id));
    if (results.length) {
      const failed = results.find(r => !r.ok);
      await db.from("google_calendar_account").update({ last_sync_at: new Date().toISOString(), last_error: failed?.error || null, ...(failed ? {} : { verified_at: new Date().toISOString() }), service_account_email: config.service_account.client_email }).eq("singleton", true);
    }
    return json({ ok: results.every(r => r.ok), results });
  } catch (e) {
    await db.from("google_calendar_account").update({ last_error: message(e) }).eq("singleton", true);
    return json({ ok: false, error: message(e) }, 200);
  }
});

// Mirrors CRM reminders into Manish's Google Calendar.
//
// Auth is a SERVICE ACCOUNT, not OAuth: one static JSON key in Edge Function
// secrets, no consent screen, nobody ever logs in. Google has no API-key path
// that can write events — a key only reads public calendars — so this is the
// only way to get "one fixed credential" and still create events.
//
// Called three ways:
//   { action: "test" }        → prove the credential + calendar work
//   { reminder_id: "<uuid>" } → sync one row immediately (from the UI)
//   { }  or the cron tick     → sweep everything still pending/failed

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SA_JSON = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ── Service-account auth ────────────────────────────────────────────────────
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s: string) => b64url(new TextEncoder().encode(s));

// The PEM in the JSON key arrives with literal backslash-n when it round-trips
// through an env var, so unescape before stripping the armour.
async function importKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

let cachedToken: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  // Tokens last an hour; a warm function should not re-mint one per reminder.
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.token;
  if (!SA_JSON) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");

  let sa: { client_email?: string; private_key?: string };
  try {
    sa = JSON.parse(SA_JSON);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON — paste the whole downloaded file");
  }
  if (!sa.client_email || !sa.private_key) throw new Error("service account JSON has no client_email/private_key");

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64urlStr(JSON.stringify(claim))}`;
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await importKey(sa.private_key),
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`token exchange failed: ${body.error_description ?? body.error ?? res.status}`);
  }
  cachedToken = { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

async function gcal(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `calendar ${res.status}`);
  return body;
}

// ── Turning a reminder into an event ────────────────────────────────────────
function eventBody(r: any, tz: string) {
  const start = new Date(r.due_at);
  const end = new Date(start.getTime() + (r.duration_min ?? 30) * 60_000);
  const who = r.contacts?.name || r.contacts?.phone || "";
  const lines = [
    r.notes || "",
    who ? `Lead: ${who}${r.contacts?.phone ? ` · ${r.contacts.phone}` : ""}` : "",
    r.contacts?.lead_status ? `Stage: ${r.contacts.lead_status}` : "",
    "",
    "Created from the Baynest CRM.",
  ].filter(Boolean);

  return {
    summary: r.title,
    description: lines.join("\n"),
    start: { dateTime: start.toISOString(), timeZone: tz },
    end: { dateTime: end.toISOString(), timeZone: tz },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: Math.max(0, r.remind_min_before ?? 10) },
        { method: "popup", minutes: 0 },
      ],
    },
  };
}

async function syncOne(db: any, r: any, calendarId: string, tz: string) {
  const cal = encodeURIComponent(calendarId);
  try {
    if (r.status === "cancelled" && r.google_event_id) {
      await gcal(`/calendars/${cal}/events/${r.google_event_id}?sendUpdates=none`, { method: "DELETE" }).catch((e) => {
        // Already gone on Google's side is a success, not a failure.
        if (!/410|404|deleted/i.test(String(e))) throw e;
      });
      await db.from("reminders").update({ sync_status: "synced", google_event_id: null, sync_error: null }).eq("id", r.id);
      return { id: r.id, ok: true, action: "deleted" };
    }

    const body = eventBody(r, tz);
    const ev = r.google_event_id
      ? await gcal(`/calendars/${cal}/events/${r.google_event_id}?sendUpdates=none`, {
          method: "PATCH",
          body: JSON.stringify(body),
        })
      : await gcal(`/calendars/${cal}/events?sendUpdates=none`, { method: "POST", body: JSON.stringify(body) });

    await db
      .from("reminders")
      .update({ google_event_id: ev.id, google_link: ev.htmlLink, sync_status: "synced", sync_error: null })
      .eq("id", r.id);
    return { id: r.id, ok: true, action: r.google_event_id ? "updated" : "created", link: ev.htmlLink };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 400);
    await db
      .from("reminders")
      .update({ sync_status: "failed", sync_error: msg, sync_attempts: (r.sync_attempts ?? 0) + 1 })
      .eq("id", r.id);
    return { id: r.id, ok: false, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const auth = req.headers.get("Authorization")?.replace("Bearer ", "");
  const cron = req.headers.get("x-cron-secret");
  const isTrusted = (CRON_SECRET && cron === CRON_SECRET) || (auth && auth === SERVICE_ROLE);
  // Signed-in staff may trigger their own reminder sync; anonymous callers may not.
  if (!isTrusted && !auth) return json({ error: "unauthorized" }, 401);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const payload = await req.json().catch(() => ({}));

  const { data: acct } = await db.from("google_calendar_account").select("*").limit(1).maybeSingle();
  const tz = acct?.time_zone || "Asia/Kolkata";

  // ── Connection test. Listing what the credential can see is the fastest way
  // to tell "the key is wrong" apart from "the calendar was never shared".
  if (payload.action === "test") {
    try {
      const list = await gcal("/users/me/calendarList");
      const cals = (list.items ?? []).map((c: any) => ({ id: c.id, summary: c.summary, access: c.accessRole }));
      const writable = cals.filter((c: any) => ["owner", "writer"].includes(c.access));
      const sa = JSON.parse(SA_JSON || "{}");
      if (writable.length) {
        await db
          .from("google_calendar_account")
          .update({
            calendar_id: acct?.calendar_id || writable[0].id,
            service_account_email: sa.client_email ?? null,
            last_error: null,
          })
          .eq("singleton", true);
      }
      return json({ ok: true, service_account: sa.client_email ?? null, calendars: cals, writable });
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      await db.from("google_calendar_account").update({ last_error: msg }).eq("singleton", true);
      return json({ ok: false, error: msg }, 200);
    }
  }

  const calendarId = acct?.calendar_id;
  if (!calendarId) return json({ ok: false, error: "No calendar selected yet — run the connection test first." }, 200);

  const sel = "*, contacts(name, phone, lead_status)";
  const q = db.from("reminders").select(sel);
  const { data: rows, error } = payload.reminder_id
    ? await q.eq("id", payload.reminder_id).limit(1)
    : await q.in("sync_status", ["pending", "failed"]).lt("sync_attempts", 5).order("due_at").limit(25);
  if (error) return json({ ok: false, error: error.message }, 500);

  const results = [];
  for (const r of rows ?? []) results.push(await syncOne(db, r, calendarId, tz));
  await db.from("google_calendar_account").update({ last_sync_at: new Date().toISOString() }).eq("singleton", true);

  return json({
    ok: true,
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
});

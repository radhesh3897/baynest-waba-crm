// ctwa-test — THROWAWAY DIAGNOSTIC. Delete once the CTWA signal is proven.
//
// Why it exists: Meta accepts our CTWA conversion payload (HTTP 200,
// events_received: 1) and then silently drops it. The dataset reports zero
// events, zero quality, last_fired_time = epoch. `events_received` only means
// "your JSON parsed", NOT "the event was recorded", so the normal API tells us
// nothing about WHY it is being binned.
//
// Test Events is the only surface where Meta shows its real verdict. This fires
// one event tagged with a test_event_code and hands back the RAW response.
//
// Deliberately touches NOTHING in production: it claims no contact, sets no
// flag, and a test_event_code event is not counted as a real conversion. It only
// reads a ctwa_clid so the test uses a genuine ad click rather than a fake one,
// which is the whole point: a made-up clid would fail for uninteresting reasons.
//
// POST { test_event_code, ctwa_clid?, event_name? }
// Auth: cron secret or service role. Deploy verify_jwt = false.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET  = Deno.env.get("CRON_SECRET") ?? "";
const WA_TOKEN     = Deno.env.get("META_CTWA_TOKEN") || Deno.env.get("WHATSAPP_TOKEN") || "";
const DATASET_ID   = Deno.env.get("META_MESSAGING_DATASET_ID") ?? "873957555788541";
const WABA_ID      = Deno.env.get("WHATSAPP_WABA_ID") ?? "";
const V            = Deno.env.get("META_API_VERSION") ?? "v21.0";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const secret = req.headers.get("x-cron-secret") ?? "";
  const authed =
    (SERVICE_ROLE !== "" && bearer === SERVICE_ROLE) ||
    (CRON_SECRET !== "" && secret === CRON_SECRET);
  if (!authed) return json({ error: "Unauthorized" }, 401);
  if (!WA_TOKEN) return json({ error: "WhatsApp token not configured" }, 500);

  const body = await req.json().catch(() => ({}));

  // lookup mode: ask Meta which dataset it believes belongs to our WABA.
  // Meta's docs are explicit that events must go to "the dataset created for that
  // specific WhatsApp Business Account". If that is not the dataset we post to,
  // every event is accepted and binned, which is exactly what we are seeing.
  if (body.lookup) {
    const out: Record<string, unknown> = { waba_id: WABA_ID, posting_to_dataset: DATASET_ID };
    for (const path of [`${WABA_ID}/dataset`, `${WABA_ID}?fields=id,name,owner_business_info`]) {
      const r = await fetch(`https://graph.facebook.com/${V}/${path}`, {
        headers: { "Authorization": `Bearer ${WA_TOKEN}` },
      });
      out[path] = { http: r.status, body: await r.json().catch(() => ({})) };
    }
    return json(out);
  }

  const testCode = String(body.test_event_code ?? "").trim();
  if (!testCode) return json({ error: "test_event_code is required" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Use a REAL click id: the newest one we captured. Testing with a fake clid
  // would prove nothing, because Meta would reject it for the wrong reason.
  let clid = String(body.ctwa_clid ?? "").trim();
  let clidSource = "supplied";
  if (!clid) {
    const { data } = await db.from("contacts")
      .select("wa_id, ctwa_clid, ctwa_clid_captured_at")
      .not("ctwa_clid", "is", null)
      .order("ctwa_clid_captured_at", { ascending: false })
      .limit(1).maybeSingle();
    if (!data?.ctwa_clid) return json({ error: "no ctwa_clid on record to test with" }, 400);
    clid = String(data.ctwa_clid);
    clidSource = `newest captured (${data.wa_id}, at ${data.ctwa_clid_captured_at})`;
  }

  const event = {
    event_name: String(body.event_name ?? "LeadSubmitted"),
    event_time: Math.floor(Date.now() / 1000),
    action_source: "business_messaging",
    messaging_channel: "whatsapp",
    user_data: {
      whatsapp_business_account_id: WABA_ID,
      ctwa_clid: clid,
    },
  };
  const payload = { data: [event], test_event_code: testCode, access_token: WA_TOKEN };

  const url = `https://graph.facebook.com/${V}/${DATASET_ID}/events`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  let meta: unknown;
  try { meta = JSON.parse(raw); } catch { meta = raw; }

  console.log("[ctwa-test]", res.status, raw);

  // Echo the request back too (minus the token), so a rejection can be read
  // against exactly what was sent.
  return json({
    http_status: res.status,
    meta_response: meta,
    sent: { url, dataset_id: DATASET_ID, waba_id: WABA_ID, test_event_code: testCode, event },
    clid_source: clidSource,
  });
});

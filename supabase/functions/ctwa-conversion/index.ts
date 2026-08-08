// ctwa-conversion — fires a single Click-to-WhatsApp (CTWA) conversion event to
// the Meta MESSAGING dataset when a contact qualifies. Matched to the ad by the
// `ctwa_clid` captured on the contact's first inbound message (see whatsapp-webhook).
//
// Contract:
//   POST { contact_id } | { wa_id }
//   Fires ONE "LeadSubmitted" event iff ALL of:
//     qualification == 'Qualified'   (this app's "qualified == true")
//     ctwa_event_fired == false
//     ctwa_clid is present
//     ctwa_clid_captured_at within the last 7 days   (Meta rejects older)
//   One qualified lead = one event. The event_fired flag is the ONLY guard —
//   Meta does NOT dedupe on its side. The flag is claimed atomically to prevent
//   a double-fire under concurrency, and rolled back if the send fails.
//
// Auth: logged-in app user (getUser) or service role. Deploy verify_jwt = false.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Token needs whatsapp_business_management + whatsapp_business_manage_events.
// Prefer a dedicated token if provided, else fall back to the app WhatsApp token.
const WA_TOKEN          = Deno.env.get("META_CTWA_TOKEN") || Deno.env.get("WHATSAPP_TOKEN") || "";
const DATASET_ID        = Deno.env.get("META_MESSAGING_DATASET_ID") ?? "873957555788541";
const WABA_ID           = Deno.env.get("WHATSAPP_WABA_ID") ?? "";
const V                 = Deno.env.get("META_API_VERSION") ?? "v21.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

async function authorize(req: Request): Promise<Response | null> {
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
  const denied = await authorize(req);
  if (denied) return denied;
  if (!WA_TOKEN) return json({ error: "WhatsApp token not configured" }, 500);

  const body = await req.json().catch(() => ({}));
  const contactId = (body.contact_id as string) || null;
  const waId = (body.wa_id as string) || null;
  if (!contactId && !waId) return json({ error: "contact_id or wa_id required" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  // Atomically CLAIM the fire: flip ctwa_event_fired false→true ONLY when every
  // condition holds. If a row comes back, this call won the claim and may send.
  let claimQ = db.from("contacts")
    .update({ ctwa_event_fired: true })
    .eq("ctwa_event_fired", false)
    .eq("qualification", "Qualified")
    .not("ctwa_clid", "is", null)
    .gte("ctwa_clid_captured_at", sevenDaysAgo);
  claimQ = contactId ? claimQ.eq("id", contactId) : claimQ.eq("wa_id", waId);
  const { data: claimed, error: claimErr } = await claimQ
    .select("id, ctwa_clid, ctwa_clid_captured_at").maybeSingle();

  if (claimErr) { console.error("ctwa claim error", claimErr); return json({ ok: false, error: "db error" }, 500); }

  if (!claimed) {
    // Nothing claimed — say why (already fired / not qualified / no clid / expired).
    let cq = db.from("contacts").select("id, qualification, ctwa_clid, ctwa_clid_captured_at, ctwa_event_fired");
    cq = contactId ? cq.eq("id", contactId) : cq.eq("wa_id", waId);
    const { data: c } = await cq.maybeSingle();
    const reason = !c ? "contact not found"
      : c.ctwa_event_fired ? "already fired"
      : c.qualification !== "Qualified" ? "not qualified"
      : !c.ctwa_clid ? "no ctwa_clid (not from a CTWA ad)"
      : "ctwa_clid older than 7 days";
    return json({ ok: false, skipped: reason });
  }

  // Build + send exactly one event.
  const event = {
    event_name: "LeadSubmitted",
    event_time: Math.floor(Date.now() / 1000),
    action_source: "business_messaging",
    messaging_channel: "whatsapp",
    user_data: {
      whatsapp_business_account_id: WABA_ID,
      ctwa_clid: claimed.ctwa_clid,
    },
  };

  let metaResp: Record<string, unknown> = {};
  let httpStatus = 0;
  let ok = false;
  try {
    const res = await fetch(`https://graph.facebook.com/${V}/${DATASET_ID}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [event], access_token: WA_TOKEN }),
    });
    httpStatus = res.status;
    metaResp = await res.json().catch(() => ({}));
    ok = res.ok && (((metaResp?.events_received as number) ?? 0) >= 1);
  } catch (e) {
    metaResp = { error: String(e) };
  }

  // Log the FULL Meta response on every fire so rejections are debuggable.
  console.log("CTWA fire", JSON.stringify({ contact_id: claimed.id, ctwa_clid: claimed.ctwa_clid, httpStatus, ok, event, metaResp }));

  const err = (metaResp?.error as Record<string, unknown>) || {};
  const statusStr = ok
    ? "fired"
    : `failed: ${(err.error_user_msg as string) || (err.message as string) || `HTTP ${httpStatus}`}`;

  if (ok) {
    await db.from("contacts").update({ ctwa_status: statusStr, ctwa_fired_at: new Date().toISOString() }).eq("id", claimed.id);
  } else {
    // Roll back the claim so a later attempt can retry (still inside the 7-day window).
    await db.from("contacts").update({ ctwa_event_fired: false, ctwa_status: statusStr }).eq("id", claimed.id);
  }

  return json({ ok, status: statusStr, events_received: (metaResp?.events_received as number) ?? 0, meta: metaResp });
});

// capi-lead-event - sends a lead-qualification event to the Meta pixel/dataset
// via the Conversions API (Conversion Leads / CRM). Matched to the ad by the
// Meta lead_id (preferred) plus hashed phone/email.
// Auth: logged-in app user (getUser) or service role. Deploy verify_jwt = false.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CAPI_TOKEN        = Deno.env.get("META_CAPI_TOKEN") ?? "";
const PIXEL_ID          = Deno.env.get("META_CAPI_PIXEL_ID") ?? "27386246781031389"; // DFY - New Pixel (CRM)
const V                 = Deno.env.get("META_API_VERSION") ?? "v21.0";

// Qualification bucket -> Meta event name.
const EVENT_NAME: Record<string, string> = {
  Intake: "Lead",
  Qualified: "Qualified",
  NotQualified: "NotQualified",
  Junk: "Junk",
};

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

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const normPhone = (p: string) => (p || "").replace(/[^0-9]/g, "");         // digits only, incl. country code
const normEmail = (e: string) => (e || "").trim().toLowerCase();
const normText  = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); // names / city

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
  const denied = await authorize(req);
  if (denied) return denied;
  if (!CAPI_TOKEN) return json({ error: "META_CAPI_TOKEN not configured" }, 500);

  const { source, id, qualification } = await req.json().catch(() => ({}));
  const eventName = EVENT_NAME[qualification as string];
  if (!source || !id || !eventName) return json({ error: "source, id and a valid qualification are required" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Load the lead's identifiers from the right table.
  let leadId = "", phone = "", email = "", firstName = "", city = "";
  if (source === "contact") {
    const { data: c } = await db.from("contacts").select("wa_id, email, profile_name, attributes").eq("id", id).maybeSingle();
    if (!c) return json({ error: "Contact not found" }, 404);
    const attrs = (c.attributes as Record<string, unknown>) ?? {};
    leadId = (attrs.meta_lead_id as string) ?? "";
    phone = c.wa_id ?? ""; email = c.email ?? "";
    firstName = ((c.profile_name as string) ?? "").trim().split(/\s+/)[0] ?? "";
    city = (attrs.city as string) ?? "";
  } else {
    const { data: t } = await db.from("tracking_leads").select("lead_id, phone, email, name, attributes").eq("id", id).maybeSingle();
    if (!t) return json({ error: "Tracking lead not found" }, 404);
    const attrs = (t.attributes as Record<string, unknown>) ?? {};
    leadId = t.lead_id ?? ""; phone = t.phone ?? ""; email = t.email ?? "";
    firstName = ((t.name as string) ?? "").trim().split(/\s+/)[0] ?? "";
    city = (attrs.city as string) ?? "";
  }

  // Build the CAPI event. More matching signals = higher Event Match Quality.
  const user_data: Record<string, unknown> = { external_id: [await sha256(String(id))] };
  if (leadId) user_data.lead_id = Number(leadId) || leadId; // do NOT hash
  if (phone) user_data.ph = [await sha256(normPhone(phone))];
  if (email) user_data.em = [await sha256(normEmail(email))];
  if (firstName) user_data.fn = [await sha256(normText(firstName))];
  if (city) user_data.ct = [await sha256(normText(city))];

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "system_generated",
    event_id: `${source}-${id}-${qualification}`, // unique per lead+stage → correct de-dupe, no wrong merging
    user_data,
  };

  const res = await fetch(`https://graph.facebook.com/${V}/${PIXEL_ID}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [event], access_token: CAPI_TOKEN }),
  });
  const meta = await res.json().catch(() => ({}));
  const ok = res.ok && (meta.events_received ?? 0) > 0;
  const status = ok ? `sent (${eventName})` : `failed: ${meta?.error?.error_user_msg || meta?.error?.message || res.status}`;

  // Persist qualification + CAPI status.
  const patch = { qualification, qualified_at: new Date().toISOString(), capi_status: status };
  if (source === "contact") await db.from("contacts").update(patch).eq("id", id);
  else await db.from("tracking_leads").update(patch).eq("id", id);

  // If this qualified contact came from a Click-to-WhatsApp ad, ALSO fire the
  // business-messaging CTWA conversion event (separate messaging dataset, matched
  // by ctwa_clid). Fire-and-forget; ctwa-conversion no-ops if not eligible.
  if (source === "contact" && qualification === "Qualified") {
    fetch(`${SUPABASE_URL}/functions/v1/ctwa-conversion`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ contact_id: id }),
    }).catch(() => {});
  }

  return json({ ok, status, event_name: eventName, matched_by: leadId ? "lead_id" : (phone || email ? "hashed_pii" : "none"), meta });
});

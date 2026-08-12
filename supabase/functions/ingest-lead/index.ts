// ingest-lead — public endpoint that n8n calls for each new Meta Lead Ad.
// Creates/updates a contact (record) in the WhatsApp tool.
// Protected by a shared secret header (x-ingest-secret) — NOT a JWT.
// Deploy with verify_jwt = false.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_SECRET = Deno.env.get("INGEST_SECRET") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function normalizeWaId(raw: string): string {
  if (!raw) return "";
  let s = String(raw).replace(/[\s\-()]/g, "");
  if (!s.startsWith("+")) s = "+" + s;
  return s;
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  // ── Shared-secret auth (so only your n8n can post leads) ──
  const provided = req.headers.get("x-ingest-secret") ?? "";
  if (!INGEST_SECRET || provided !== INGEST_SECRET) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  // Accept flexible field names from n8n's parsed lead.
  const phone =
    (body.phone as string) ?? (body.phone_number as string) ?? (body.wa_id as string) ?? "";
  const wa_id = normalizeWaId(phone);
  if (!wa_id || wa_id.length < 8) {
    return json({ error: "A valid phone / wa_id is required", got: phone }, 422);
  }

  const first = (body.first_name as string) ?? "";
  const last = (body.last_name as string) ?? "";
  const name =
    (body.name as string) || `${first} ${last}`.trim() || wa_id;

  // Everything that isn't a core column goes into attributes (jsonb).
  const core = new Set(["phone", "phone_number", "wa_id", "name", "first_name", "last_name", "email", "work_email", "work_email_address", "company", "company_name", "job_title", "source", "form_id", "attributes"]);
  const extra: Record<string, unknown> = (body.attributes as Record<string, unknown>) ?? {};
  for (const [k, v] of Object.entries(body)) {
    if (!core.has(k) && v !== "" && v != null) extra[k] = v;
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Resolve the Meta form id (text) → our fb_forms uuid, if the lead carries one.
  let formUuid: string | null = null;
  if (body.form_id) {
    const { data: f } = await db.from("fb_forms").select("id").eq("form_id", String(body.form_id)).maybeSingle();
    formUuid = f?.id ?? null;
  }

  // Upsert by wa_id. On a returning lead we refresh contact details but keep
  // the existing lead_status (don't reset a Hot lead back to New).
  const { data: existing } = await db
    .from("contacts")
    .select("id, attributes")
    .eq("wa_id", wa_id)
    .maybeSingle();

  const row: Record<string, unknown> = {
    wa_id,
    profile_name: name,
    email: (body.email as string) ?? (body.work_email_address as string) ?? (body.work_email as string) ?? null,
    company: (body.company as string) ?? (body.company_name as string) ?? null,
    job_title: (body.job_title as string) ?? null,
    source: (body.source as string) ?? "Meta Lead Ads",
    form_id: formUuid,
    attributes: { ...(existing?.attributes as Record<string, unknown> ?? {}), ...extra },
  };
  if (!existing) row.lead_status = "New";

  const { data: contact, error } = await db
    .from("contacts")
    .upsert(row, { onConflict: "wa_id", ignoreDuplicates: false })
    .select("id, wa_id, profile_name")
    .single();

  if (error) {
    console.error("ingest-lead upsert failed", error);
    return json({ error: "DB error", detail: error.message }, 500);
  }

  // Fire the "new lead" automation trigger — enrolls into any active flow whose
  // trigger is "new_lead". Which template(s) / delays run is defined in the builder,
  // not here.
  // Fire the "new lead" trigger for the visual Flow Builder (and the legacy
  // linear sequences, harmless if none are active).
  // Backfill callers (poll-leads catching up on old leads) pass skip_automation
  // so a three-day-old enquiry does not get a "we just received your enquiry"
  // message. The lead still lands in the CRM, it just isn't messaged.
  const skipAutomation = body.skip_automation === true;

  let enrolled = 0;
  if (!skipAutomation) {
    try {
      const { data: nf } = await db.rpc("enroll_into_flows", { p_contact_id: contact.id, p_trigger: "new_lead" });
      enrolled = (nf as number) ?? 0;
      await db.rpc("enroll_into_trigger", { p_contact_id: contact.id, p_trigger: "new_lead" });
    } catch (e) {
      console.error("enroll failed", e);
    }
  }

  // Email + phone-push alerts on a brand-new lead.
  if (!existing && !skipAutomation) {
    const src = (body.source as string) ?? "Meta Lead Ads";
    fetch(`${SUPABASE_URL}/functions/v1/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({
        kind: "lead",
        subject: `New lead: ${name}`,
        text: `New lead ${name} (${wa_id}) via ${src} — open the DFY tool to follow up.`,
      }),
    }).catch(() => {});

    fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({
        title: `New lead: ${name}`,
        body: `${wa_id} · via ${src}`,
        url: "/",
      }),
    }).catch(() => {});
  }

  return json({ ok: true, contact_id: contact.id, wa_id: contact.wa_id, new: !existing, enrolled });
});

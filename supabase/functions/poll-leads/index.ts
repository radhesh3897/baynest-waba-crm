// poll-leads — pulls new Meta Lead Ads leads on a schedule.
//
// Why this exists: the leadgen WEBHOOK is configured correctly at both app and
// page level and reports active, yet Meta has never delivered a single event —
// verified against real leads and against Meta's own test_leads endpoint. The
// Graph API can read those same leads perfectly well, so we poll instead. If
// the webhook ever starts firing, meta_leadgen_events dedupes by leadgen_id and
// whichever path arrives first wins; the other becomes a no-op.
//
// Deploy with verify_jwt = false; authorize() gates it (cron secret or service
// role).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_TOKEN       = Deno.env.get("WHATSAPP_TOKEN")!;
const META_API_VERSION = Deno.env.get("META_API_VERSION") ?? "v21.0";
const CRON_SECRET      = Deno.env.get("CRON_SECRET") ?? "";
const INGEST_SECRET    = Deno.env.get("INGEST_SECRET") ?? "";

// Leads older than this are filed in the CRM but never auto-messaged. Sending
// "we just received your enquiry" days late reads worse than staying silent.
const AUTOMATION_MAX_AGE_HOURS = 24;

// Leads pulled per form per run. The account runs a few leads a day, so this is
// generous; the dedupe table makes overlap free.
const PER_FORM = 15;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

function authorize(req: Request): Response | null {
  const cron = req.headers.get("x-cron-secret");
  if (CRON_SECRET && cron === CRON_SECRET) return null;
  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (auth && auth === SERVICE_ROLE) return null;
  return json({ error: "Unauthorized" }, 401);
}

function pickField(fields: Record<string, string>, needles: string[]): string {
  for (const n of needles) if (fields[n]) return fields[n];
  for (const [k, v] of Object.entries(fields)) {
    if (v && needles.some(n => k.includes(n))) return v;
  }
  return "";
}

serve(async (req: Request) => {
  const denied = authorize(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  // A first run can be told to file history without messaging anyone.
  const forceSkipAutomation = body.skip_automation === true;

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: settings } = await db.from("app_settings").select("fb_page_id").eq("id", 1).maybeSingle();
  const pageId = settings?.fb_page_id;
  if (!pageId) return json({ error: "app_settings.fb_page_id is not set" }, 400);

  const ptRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${pageId}?fields=access_token&access_token=${META_TOKEN}`);
  const ptJson = await ptRes.json().catch(() => ({})) as Record<string, unknown>;
  const pageToken = ptJson.access_token as string;
  if (!pageToken) return json({ error: "Could not derive page token", detail: ptJson }, 502);

  // One call covers every form on the page, newest leads first per form.
  const url = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/leadgen_forms`
    + `?fields=id,name,leads.limit(${PER_FORM}){id,created_time,field_data}&limit=100&access_token=${pageToken}`;
  const res = await fetch(url);
  const j = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) return json({ error: "Meta leads fetch failed", detail: j }, 502);

  type Lead = { formId: string; formName: string; id: string; created: string; fields: Record<string, string> };
  const leads: Lead[] = [];
  for (const f of ((j.data as Record<string, unknown>[]) ?? [])) {
    for (const l of ((((f.leads as Record<string, unknown>)?.data) as Record<string, unknown>[]) ?? [])) {
      const fields: Record<string, string> = {};
      for (const fd of ((l.field_data as Record<string, unknown>[]) ?? [])) {
        const k = String(fd.name ?? "").toLowerCase();
        const v = ((fd.values as unknown[]) ?? [])[0];
        if (k && v != null && v !== "") fields[k] = String(v);
      }
      leads.push({
        formId: String(f.id), formName: String(f.name ?? ""),
        id: String(l.id), created: String(l.created_time ?? ""), fields,
      });
    }
  }
  // Oldest first, so a burst arrives in the order people actually submitted.
  leads.sort((a, b) => a.created.localeCompare(b.created));

  let claimed = 0, ingested = 0, skippedOld = 0, failed = 0;
  const errors: string[] = [];

  for (const lead of leads) {
    // Claim first: this is the same guard the webhook uses, so a lead can never
    // be ingested twice even if both paths run.
    const { error: claimErr } = await db.from("meta_leadgen_events").insert({
      leadgen_id: lead.id, page_id: pageId, form_id: lead.formId,
      status: "received", raw: { source: "poll", created_time: lead.created },
    });
    if (claimErr) continue;   // already seen
    claimed++;

    const phone = pickField(lead.fields, ["phone_number", "phone", "mobile", "whatsapp", "contact_number"]);
    if (!phone) {
      failed++;
      errors.push(`${lead.id}: no phone field`);
      await db.from("meta_leadgen_events").update({ status: "error", error: "no phone field" }).eq("leadgen_id", lead.id);
      continue;
    }

    const ageHours = (Date.now() - Date.parse(lead.created)) / 3600_000;
    const skipAutomation = forceSkipAutomation || ageHours > AUTOMATION_MAX_AGE_HOURS;
    if (skipAutomation) skippedOld++;

    const payload = {
      phone,
      name: pickField(lead.fields, ["full_name", "name"]),
      first_name: lead.fields.first_name ?? "",
      last_name: lead.fields.last_name ?? "",
      email: pickField(lead.fields, ["email"]),
      city: pickField(lead.fields, ["city", "location", "area"]),
      source: "Meta Lead Ads",
      form_id: lead.formId,
      meta_lead_id: lead.id,
      form_name: lead.formName,
      lead_created_time: lead.created,
      form_answers: lead.fields,
      skip_automation: skipAutomation,
    };

    const ing = await fetch(`${SUPABASE_URL}/functions/v1/ingest-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-secret": INGEST_SECRET },
      body: JSON.stringify(payload),
    });
    const out = await ing.json().catch(() => ({})) as Record<string, unknown>;
    if (!ing.ok) {
      failed++;
      errors.push(`${lead.id}: ingest ${ing.status}`);
      await db.from("meta_leadgen_events").update({ status: "error", error: JSON.stringify(out).slice(0, 400) }).eq("leadgen_id", lead.id);
      continue;
    }
    ingested++;
    await db.from("meta_leadgen_events")
      .update({ status: "ingested", contact_id: (out.contact_id as string) ?? null })
      .eq("leadgen_id", lead.id);
  }

  return json({
    ok: true, forms_scanned: ((j.data as unknown[]) ?? []).length,
    leads_seen: leads.length, new_claimed: claimed,
    ingested, messaged: ingested - skippedOld, filed_without_messaging: skippedOld,
    failed, errors: errors.slice(0, 10),
  });
});

// notify — sends an email alert (via Resend) to the team addresses configured in
// app_settings. Called internally by ingest-lead (new lead) and whatsapp-webhook
// (inbound message). Deploy with verify_jwt = false.
// Requires the RESEND_API_KEY secret. No-ops gracefully if it's missing.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  // Internal-only: the only legitimate callers are our own edge functions
  // (whatsapp-webhook, ingest-lead), which present the service-role key. This
  // blocks the previously-open email relay (anyone could POST arbitrary alerts).
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token !== SERVICE_ROLE) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const kind = String(body.kind ?? "");            // 'lead' | 'inbound'
  const subject = String(body.subject ?? "DFY Inbox notification");
  const text = String(body.text ?? "");

  if (!RESEND_API_KEY) return json({ ok: false, skipped: "RESEND_API_KEY not set" });

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: s } = await db.from("app_settings").select("notify_emails, notify_from, notify_new_lead, notify_inbound").eq("id", 1).maybeSingle();

  if (kind === "lead" && s?.notify_new_lead === false) return json({ ok: false, skipped: "new-lead alerts off" });
  if (kind === "inbound" && s?.notify_inbound === false) return json({ ok: false, skipped: "inbound alerts off" });

  const emails = String(s?.notify_emails ?? "").split(",").map(e => e.trim()).filter(Boolean);
  if (emails.length === 0) return json({ ok: false, skipped: "no notify_emails configured" });
  const from = String(s?.notify_from || "DFY Inbox <onboarding@resend.dev>");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: emails, subject, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("resend error", res.status, data); return json({ ok: false, error: data }, 502); }
  return json({ ok: true, to: emails });
});

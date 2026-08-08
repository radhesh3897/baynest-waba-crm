// send-template-test — sends a template to a test number with its variables filled
// from that contact's fields (same logic the flow engine uses). The number must
// already exist as a contact in People. verify_jwt = true.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN    = Deno.env.get("WHATSAPP_TOKEN")!;
const PHONE_NUMBER_ID   = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const META_API_VERSION  = Deno.env.get("META_API_VERSION") ?? "v21.0";
const META_URL = `https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

function resolveField(contact: Record<string, unknown>, key?: string): string {
  if (!key) return "";
  if (key === "profile_name" || key === "name") return String(contact.profile_name ?? "");
  if (key === "first_name") return String(contact.profile_name ?? "").split(" ")[0] ?? "";
  if (key === "phone" || key === "wa_id") return String(contact.wa_id ?? "");
  if (key === "email") return String(contact.email ?? "");
  if (key === "company") return String(contact.company ?? "");
  if (key === "job_title") return String(contact.job_title ?? "");
  const attrs = (contact.attributes as Record<string, unknown>) ?? {};
  return String(attrs[key] ?? "");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token && token !== SERVICE_ROLE) {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error } = await anon.auth.getUser(token);
    if (error || !user) return json({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const rawPhone = String(body.wa_id ?? "");
  const templateName = String(body.template_name ?? "");
  const variables = (body.variables as Record<string, string>) || {};
  if (!rawPhone || !templateName) return json({ error: "A phone number and template are required." }, 400);

  const clean = rawPhone.replace(/[\s\-()]/g, "");
  const wa_id = clean.startsWith("+") ? clean : "+" + clean;

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: contact } = await db.from("contacts").select("id, wa_id, profile_name, email, company, job_title, attributes").eq("wa_id", wa_id).maybeSingle();
  if (!contact) return json({ error: `No contact found for ${wa_id}. Add this number under People first, then test.` }, 404);

  const { data: tpl } = await db.from("templates").select("language, body").eq("name", templateName).maybeSingle();
  if (!tpl) return json({ error: "Template not found — sync templates first." }, 404);
  const lang = (tpl.language as string) || "en";
  const tplBody = String(tpl.body || "");
  const varIdx = [...new Set((tplBody.match(/\{\{(\d+)\}\}/g) || []).map(m => parseInt(m.replace(/[^\d]/g, ""), 10)))].sort((a, b) => a - b);
  const params = varIdx.map(i => ({ type: "text", text: resolveField(contact, variables[String(i)]) || resolveField(contact, "first_name") || "there" }));
  const components = params.length ? [{ type: "body", parameters: params }] : [];

  const payload = { messaging_product: "whatsapp", to: wa_id, type: "template", template: { name: templateName, language: { code: lang }, components } };
  const res = await fetch(META_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${WHATSAPP_TOKEN}` }, body: JSON.stringify(payload) });
  const meta = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (meta as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
    const msg = (e?.error_user_msg as string) || (e?.message as string) || "Meta API error";
    return json({ error: msg, detail: meta }, 502);
  }

  // Persist so the test shows in the inbox thread too.
  const { data: conv } = await db.from("conversations").select("id").eq("contact_id", contact.id).eq("channel", "whatsapp").maybeSingle();
  let convId = conv?.id as string | undefined;
  if (!convId) { const { data: c } = await db.from("conversations").insert({ contact_id: contact.id, channel: "whatsapp", status: "open" }).select("id").single(); convId = c?.id; }
  if (convId) {
    const waMessageId = ((meta?.messages as unknown[])?.[0] as Record<string, unknown>)?.id as string ?? null;
    await db.from("messages").insert({ conversation_id: convId, contact_id: contact.id, wa_message_id: waMessageId, direction: "out", type: "template", template_name: templateName, payload, status: "sent" });
  }

  const preview = params.length ? tplBody.replace(/\{\{(\d+)\}\}/g, (_m, n) => params[varIdx.indexOf(parseInt(n, 10))]?.text ?? `{{${n}}}`) : tplBody;
  return json({ ok: true, sent_to: wa_id, preview });
});

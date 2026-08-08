// process-flows — the visual flow engine. Runs every minute via pg_cron.
// Walks each active run through the graph: trigger → send/delay/branch/action → wait/complete.
// Button branches & wait-for-reply pause the run; the webhook resumes it on reply.
// Deploy with verify_jwt = false.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN   = Deno.env.get("WHATSAPP_TOKEN")!;
const PHONE_NUMBER_ID  = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const META_API_VERSION = Deno.env.get("META_API_VERSION") ?? "v21.0";
const CRON_SECRET      = Deno.env.get("CRON_SECRET") ?? "";

const META_URL = `https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const nowISO = () => new Date().toISOString();

type Node = { node_key: string; type: string; data: Record<string, unknown> };
type Edge = { source_node_key: string; source_handle: string | null; source_button: string | null; target_node_key: string };

function targetFor(edges: Edge[], nodeKey: string, handle: string): string | null {
  const exact = edges.find(e => e.source_node_key === nodeKey && e.source_handle === handle);
  if (exact) return exact.target_node_key;
  if (handle === "out") {
    const any = edges.find(e => e.source_node_key === nodeKey);
    return any?.target_node_key ?? null;
  }
  return null;
}
const outgoing = (edges: Edge[], nodeKey: string) => edges.filter(e => e.source_node_key === nodeKey);

serve(async (req: Request) => {
  // Fail CLOSED: require the cron secret (or a service-role bearer). See process-sequences.
  const cron = req.headers.get("x-cron-secret");
  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const ok = (CRON_SECRET && cron === CRON_SECRET) || (auth && auth === SERVICE_ROLE);
  if (!ok) return json({ error: "Unauthorized" }, 401);
  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: runs, error } = await db
    .from("flow_runs")
    .select("id, flow_id, contact_id, current_node_key, created_at, contacts(wa_id, profile_name, email, company, job_title, lead_status, lead_score, source, attributes)")
    .eq("status", "active")
    .lte("next_run_at", nowISO())
    .limit(100);

  if (error) return json({ error: "DB error", detail: error.message }, 500);
  if (!runs || runs.length === 0) return json({ ok: true, processed: 0 });

  // Cache graph per flow for this tick.
  const graphCache: Record<string, { nodes: Node[]; edges: Edge[] }> = {};
  async function graph(flowId: string) {
    if (graphCache[flowId]) return graphCache[flowId];
    const [{ data: nodes }, { data: edges }] = await Promise.all([
      db.from("flow_nodes").select("node_key, type, data").eq("flow_id", flowId),
      db.from("flow_edges").select("source_node_key, source_handle, source_button, target_node_key").eq("flow_id", flowId),
    ]);
    graphCache[flowId] = { nodes: (nodes ?? []) as Node[], edges: (edges ?? []) as Edge[] };
    return graphCache[flowId];
  }

  let sent = 0, completed = 0, waiting = 0;

  for (const run of runs) {
    const contact = run.contacts as Record<string, unknown>;
    const waId = contact?.wa_id as string;
    const { nodes, edges } = await graph(run.flow_id);
    const nodeByKey = (k: string | null) => nodes.find(n => n.node_key === k) || null;

    let node = nodeByKey(run.current_node_key);
    let guard = 0;
    let done = false;

    while (node && guard++ < 25 && !done) {
      const t = node.type;

      if (t === "trigger") { node = nodeByKey(targetFor(edges, node.node_key, "out")); continue; }

      if (t === "ifElse") {
        const pass = evalCondition(node.data, contact);
        node = nodeByKey(targetFor(edges, node.node_key, pass ? "true" : "false"));
        continue;
      }

      if (t === "action") { await applyAction(db, node.data, run.contact_id, contact); node = nodeByKey(targetFor(edges, node.node_key, "out")); continue; }

      if (t === "delay") {
        const tgt = targetFor(edges, node.node_key, "out");
        const mins = toMinutes(node.data);
        if (!tgt) { await complete(db, run.id); completed++; }
        else await db.from("flow_runs").update({ current_node_key: tgt, next_run_at: new Date(Date.now() + mins * 60000).toISOString(), updated_at: nowISO() }).eq("id", run.id);
        done = true; break;
      }

      if (t === "sendText") {
        if (waId && node.data.text) { await send(db, waId, run.contact_id, run.flow_id, { type: "text", text: String(node.data.text) }); sent++; }
        const tgt = targetFor(edges, node.node_key, "out");
        if (!tgt) { await complete(db, run.id); completed++; }
        else await db.from("flow_runs").update({ current_node_key: tgt, next_run_at: nowISO(), updated_at: nowISO() }).eq("id", run.id);
        done = true; break;
      }

      if (t === "sendTemplate") {
        if (waId && node.data.templateName) {
          const tplName = String(node.data.templateName);
          const { data: tpl } = await db.from("templates").select("language, body, status").eq("name", tplName).maybeSingle();

          // A template still in review cannot be sent: Meta rejects the call and
          // the lead silently gets nothing, because the run advances regardless.
          // Hold the run and look again in 10 minutes instead of burning it.
          // Capped at 24h so a permanently rejected template can't loop forever.
          const pending = String(tpl?.status ?? "").toLowerCase() === "pending";
          const ageMs = Date.now() - Date.parse(String(run.created_at ?? nowISO()));
          if (pending && ageMs < 24 * 60 * 60 * 1000) {
            await db.from("flow_runs")
              .update({ next_run_at: new Date(Date.now() + 10 * 60000).toISOString(), updated_at: nowISO() })
              .eq("id", run.id);
            console.log(`[flows] holding run ${run.id}: template "${tplName}" still in review`);
            done = true; break;
          }

          const lang = (tpl?.language as string) || "en";
          const tplBody = String(tpl?.body || "");
          const varIdx = [...new Set((tplBody.match(/\{\{(\d+)\}\}/g) || []).map(m => parseInt(m.replace(/[^\d]/g, ""), 10)))].sort((a, b) => a - b);
          const varMap = (node.data.variables as Record<string, string>) || {};
          const bodyParams = varIdx.map(i => ({ type: "text", text: resolveField(contact, varMap[String(i)]) || resolveField(contact, "first_name") || "there" }));
          await send(db, waId, run.contact_id, run.flow_id, { type: "template", template: tplName, language: lang, bodyParams });
          sent++;
        }
        const hasButtons = outgoing(edges, node.node_key).some(e => (e.source_handle ?? "").startsWith("btn-"));
        if (hasButtons) { await db.from("flow_runs").update({ status: "waiting", updated_at: nowISO() }).eq("id", run.id); waiting++; done = true; break; }
        const tgt = targetFor(edges, node.node_key, "out");
        if (!tgt) { await complete(db, run.id); completed++; }
        else await db.from("flow_runs").update({ current_node_key: tgt, next_run_at: nowISO(), updated_at: nowISO() }).eq("id", run.id);
        done = true; break;
      }

      if (t === "waitReply") { await db.from("flow_runs").update({ status: "waiting", current_node_key: node.node_key, updated_at: nowISO() }).eq("id", run.id); waiting++; done = true; break; }

      // Unknown node — try to move on.
      node = nodeByKey(targetFor(edges, node.node_key, "out"));
    }

    if (!done) {
      if (!node) { await complete(db, run.id); completed++; }
      else { await db.from("flow_runs").update({ status: "failed", updated_at: nowISO() }).eq("id", run.id); }
    }
  }

  return json({ ok: true, processed: runs.length, sent, completed, waiting });
});

function toMinutes(data: Record<string, unknown>): number {
  const amt = Number(data.amount ?? 0);
  const unit = String(data.unit ?? "minutes");
  return amt * (unit === "days" ? 1440 : unit === "hours" ? 60 : 1);
}

function evalCondition(data: Record<string, unknown>, contact: Record<string, unknown>): boolean {
  const field = String(data.field ?? "lead_status");
  const want = String(data.value ?? "").trim().toLowerCase();
  let actual = "";
  if (field === "lead_score") actual = String(contact.lead_score ?? "");
  else if (field === "source") actual = String(contact.source ?? "");
  else if (field === "city") actual = String((contact.attributes as Record<string, unknown>)?.city ?? "");
  else actual = String(contact.lead_status ?? "");
  return actual.trim().toLowerCase() === want;
}

async function applyAction(db: ReturnType<typeof createClient>, data: Record<string, unknown>, contactId: string, contact: Record<string, unknown>) {
  const action = String(data.action ?? "");
  const value = String(data.value ?? "");
  if (action === "status") {
    await db.from("contacts").update({ lead_status: value, updated_at: nowISO() }).eq("id", contactId);
  } else if (action === "score") {
    const cur = Number(contact.lead_score ?? 0);
    let next = cur;
    if (/^[+-]/.test(value)) next = cur + Number(value);
    else if (value) next = Number(value);
    await db.from("contacts").update({ lead_score: Math.max(0, Math.min(100, next)), updated_at: nowISO() }).eq("id", contactId);
  } else if (action === "tag") {
    const attrs = (contact.attributes as Record<string, unknown>) ?? {};
    const tags = Array.isArray(attrs.tags) ? attrs.tags as string[] : [];
    if (value && !tags.includes(value)) tags.push(value);
    await db.from("contacts").update({ attributes: { ...attrs, tags }, updated_at: nowISO() }).eq("id", contactId);
  }
}

async function ensureConversation(db: ReturnType<typeof createClient>, contactId: string): Promise<string | null> {
  const { data: existing } = await db.from("conversations").select("id").eq("contact_id", contactId).maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await db.from("conversations").insert({ contact_id: contactId, status: "open" }).select("id").single();
  return created?.id ?? null;
}

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

async function send(db: ReturnType<typeof createClient>, waId: string, contactId: string, flowId: string | null, msg: { type: "text" | "template"; text?: string; template?: string; language?: string; bodyParams?: { type: string; text: string }[] }) {
  const components = (msg.bodyParams && msg.bodyParams.length) ? [{ type: "body", parameters: msg.bodyParams }] : [];
  const payload = msg.type === "text"
    ? { messaging_product: "whatsapp", recipient_type: "individual", to: waId, type: "text", text: { preview_url: false, body: msg.text } }
    : { messaging_product: "whatsapp", to: waId, type: "template", template: { name: msg.template, language: { code: msg.language || "en" }, components } };

  const res = await fetch(META_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${WHATSAPP_TOKEN}` }, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  const waMessageId = (((body as Record<string, unknown>)?.messages as unknown[])?.[0] as Record<string, unknown>)?.id as string ?? null;

  const convId = await ensureConversation(db, contactId);
  if (convId) {
    await db.from("messages").insert({
      conversation_id: convId, contact_id: contactId, wa_message_id: waMessageId,
      direction: "out", type: msg.type, body: msg.type === "text" ? msg.text : null,
      template_name: msg.type === "template" ? msg.template : null, payload, flow_id: flowId,
      status: res.ok ? "sent" : "failed", error: res.ok ? null : body,
    });
  }
  if (!res.ok) console.error("flow send failed", res.status, body);
}

async function complete(db: ReturnType<typeof createClient>, runId: string) {
  await db.from("flow_runs").update({ status: "completed", updated_at: nowISO() }).eq("id", runId);
}

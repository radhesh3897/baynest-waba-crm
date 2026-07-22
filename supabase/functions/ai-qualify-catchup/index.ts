// ai-qualify-catchup — the AI qualifier's every-minute tick. Catches up on
// whatever the qualifier still owes a lead. Two jobs:
//
// 1. RECOVER a dropped reply. The webhook normally greets and qualifies a
//    first-time lead inline. If that fails part-way (isolate reclaimed, Claude
//    blip, send failure) the lead hangs and the ad spend that bought them is
//    wasted. Here the last message is THEIRS, so we owe them an answer.
// 2. NUDGE a lead who went quiet. Here the last message is OURS: we asked
//    something and they never came back. Nudge once after 20 minutes, then once
//    more ~20 hours in, 4 hours before the 24h window shuts. Never more than two.
//
// Both candidate queries and both claims live in SQL, so the guards are enforced
// in one place: 24h window open, kill switch on, not already qualified, and an
// atomic claim per contact so two runners can never double-send. Recovery also
// ignores anything under 2 minutes old, so it never races a healthy webhook.
//
// Auth: fail CLOSED. Only our cron (x-cron-secret) or a service-role caller,
// because this sends real WhatsApp messages. Deploy verify_jwt = false.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET  = Deno.env.get("CRON_SECRET") ?? "";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const secret = req.headers.get("x-cron-secret") ?? "";
  const authed =
    (CRON_SECRET !== "" && secret === CRON_SECRET) ||
    (SERVICE_ROLE !== "" && bearer === SERVICE_ROLE);
  if (!authed) return json({ error: "Unauthorized" }, 401);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: candidates, error } = await db.rpc("ai_qualify_candidates", { p_limit: 10 });
  if (error) {
    console.error("[catchup] candidate lookup failed", error);
    return json({ error: "candidate lookup failed" }, 500);
  }

  const rows = (candidates ?? []) as Record<string, string>[];
  const done: unknown[] = [];

  for (const c of rows) {
    // Claim first: if another runner already holds this contact, skip it.
    const { data: claimed } = await db.rpc("ai_qualify_claim", { p_contact: c.contact_id });
    if (!claimed) continue;
    try {
      const r = await runQualifier(db, c.contact_id, c.conversation_id, c.wa_id, c.profile_name);
      console.log("[catchup] recovered", c.wa_id, JSON.stringify(r));
      done.push({ wa_id: c.wa_id, ...r });
    } catch (e) {
      console.error("[catchup] run failed", c.wa_id, e);
      done.push({ wa_id: c.wa_id, ok: false });
    }
  }

  // ── Job 2: nudge the leads who went quiet ────────────────────────────────
  const { data: fups, error: fupErr } = await db.rpc("ai_followup_candidates", { p_limit: 10 });
  if (fupErr) console.error("[catchup] follow-up lookup failed", fupErr);

  const nudged: unknown[] = [];
  for (const f of ((fups ?? []) as Record<string, string | number>[])) {
    const nudge = Number(f.nudge);
    // Claiming advances ai_followups_sent, so a nudge can never be sent twice.
    const { data: claimed } = await db.rpc("ai_followup_claim", {
      p_contact: f.contact_id, p_nudge: nudge,
    });
    if (!claimed) continue;

    const text = nudgeText(nudge, String(f.profile_name));
    const sent = await sendText(String(f.wa_id), text);
    console.log("[catchup] nudge", nudge, f.wa_id, sent ? "sent" : "FAILED");
    nudged.push({ wa_id: f.wa_id, nudge, ok: sent, text });
  }

  return json({
    ok: true,
    recovered: { considered: rows.length, processed: done.length, done },
    nudged: { considered: (fups ?? []).length, processed: nudged.length, nudged },
  });
});

// WhatsApp hands us the full profile name, and falls back to the wa_id when the
// lead has no profile name set. Neither is something you'd greet a person with.
function firstNameOf(name: string): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || /^[+\d]/.test(first)) return "there";
  return first;
}

// The nudges are fixed lines rather than a model call: they are one-liners, so
// paying for a Claude round-trip would buy nothing but variance.
function nudgeText(nudge: number, profileName: string): string {
  const name = firstNameOf(profileName);
  return nudge === 1
    ? `Hi ${name}, are you still there?`
    : `Hi ${name}, just checking in before this chat closes. Still happy to help with your ads whenever you have a minute.`;
}

async function sendText(waId: string, text: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({ wa_id: waId, type: "text", text }),
  }).catch(() => null);
  if (!res || !res.ok) {
    console.error("[catchup] send failed", waId, res?.status, await res?.text().catch(() => ""));
    return false;
  }
  return true;
}

// Same conversation step the webhook runs: rebuild the history, ask the shared
// brain for the next message, send it, and hand over when the script completes.
async function runQualifier(
  db: ReturnType<typeof createClient>,
  contactId: string,
  conversationId: string,
  waId: string,
  name: string,
) {
  const { data: msgs } = await db
    .from("messages")
    .select("direction, body, type, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);

  // Messages with no text (voice note, image, file) must still appear, or the
  // history ends on our own turn and the model has nothing to answer. Same rule
  // as the webhook — see buildHistory there.
  const history = (msgs ?? []).map((row) => {
    const m = row as Record<string, unknown>;
    const body = String(m.body ?? "").trim();
    const role = m.direction === "in" ? "user" : "assistant";
    if (body) return { role, content: body };
    if (role !== "user") return null;
    return { role, content: `[the lead sent a ${String(m.type ?? "media")} message with no text in it]` };
  }).filter(Boolean) as { role: string; content: string }[];
  if (history.length === 0) history.push({ role: "user", content: "Hi" });
  history.splice(0, Math.max(0, history.length - 30));

  const aiRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-qualify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({ messages: history, name }),
  });
  const ai = await aiRes.json().catch(() => ({} as Record<string, unknown>));
  const reply = (ai as Record<string, unknown>)?.reply as string | undefined;
  if (!aiRes.ok || !reply) {
    console.error("[catchup] ai-qualify returned no reply", aiRes.status, ai);
    return { ok: false, reason: "no reply from brain" };
  }

  if (!await sendText(waId, reply)) return { ok: false, reason: "send failed" };

  const outcome = (ai as Record<string, unknown>)?.outcome as string | undefined;

  if ((ai as Record<string, unknown>)?.done === true) {
    await db.from("contacts").update({ ai_status: "done" }).eq("id", contactId);

    if (outcome === "affiliate") {
      // Affiliate / MLM / reseller: declined. Tag and stop. No Meta event, no
      // expert hand-off.
      await db.rpc("tag_contact", { p_contact: contactId, p_tag: "affiliate" });
    } else {
      if (outcome === "buy_leads") {
        // Wants to buy leads, not run ads. Tag for the team and fire NOTHING: a
        // Qualified event here would teach Meta to find more lead buyers.
        await db.rpc("tag_buy_leads", { p_contact: contactId });
      } else {
        // A real ads prospect: marks Qualified and fires the CRM pixel event, which
        // chains the CTWA conversion event for leads that came from a WhatsApp ad.
        fetch(`${SUPABASE_URL}/functions/v1/capi-lead-event`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
          body: JSON.stringify({ source: "contact", id: contactId, qualification: "Qualified" }),
        }).catch(() => {});
      }

      // Hand qualified + buy-leads chats to the team owner. Declined affiliates
      // are deliberately NOT assigned.
      const { data: owner } = await db
        .from("profiles").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (owner?.id) {
        await db.from("conversations").update({ assigned_to: owner.id }).eq("id", conversationId);
      }
    }
  }

  return { ok: true, done: (ai as Record<string, unknown>)?.done === true, outcome, sent: reply };
}

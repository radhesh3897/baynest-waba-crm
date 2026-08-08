// process-sequences — the drip engine. Called every minute by pg_cron.
// Finds enrollments whose next_run_at is due, sends that step's template,
// advances to the next step (scheduling its delay) or completes the enrollment.
// Deploy with verify_jwt = false. Optionally protected by CRON_SECRET.

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

serve(async (req: Request) => {
  // Fail CLOSED: require the cron secret (or a service-role bearer). If CRON_SECRET
  // is not configured, no caller can satisfy the check, so the engine won't run
  // for an anonymous request. Matches campaign-run's guard.
  const cron = req.headers.get("x-cron-secret");
  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const ok = (CRON_SECRET && cron === CRON_SECRET) || (auth && auth === SERVICE_ROLE);
  if (!ok) return json({ error: "Unauthorized" }, 401);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: due, error } = await db
    .from("sequence_enrollments")
    .select("id, sequence_id, contact_id, current_position, contacts(wa_id)")
    .eq("status", "active")
    .lte("next_run_at", new Date().toISOString())
    .limit(100);

  if (error) return json({ error: "DB error", detail: error.message }, 500);
  if (!due || due.length === 0) return json({ ok: true, processed: 0 });

  let sent = 0, completed = 0, failed = 0;

  for (const enr of due) {
    const waId = (enr.contacts as Record<string, unknown>)?.wa_id as string;
    if (!waId) { await complete(db, enr.id); completed++; continue; }

    // Ordered steps for this sequence.
    const { data: steps } = await db
      .from("sequence_steps")
      .select("template_name, template_language, delay_after_minutes, position")
      .eq("sequence_id", enr.sequence_id)
      .order("position", { ascending: true });

    const cp = enr.current_position ?? 0;
    if (!steps || cp >= steps.length) { await complete(db, enr.id); completed++; continue; }

    const step = steps[cp];

    // Ensure a conversation exists (lead may never have messaged us).
    const convId = await ensureConversation(db, enr.contact_id);

    // Send the template via Meta.
    const ok = await sendTemplate(db, waId, step, enr.contact_id, convId);
    if (!ok) { failed++; continue; } // leave active; retried next tick
    sent++;

    // Advance.
    const nextPos = cp + 1;
    if (nextPos >= steps.length) {
      await complete(db, enr.id);
      completed++;
    } else {
      const nextDelay = steps[nextPos].delay_after_minutes ?? 0;
      await db.from("sequence_enrollments").update({
        current_position: nextPos,
        last_step_at: new Date().toISOString(),
        next_run_at: new Date(Date.now() + nextDelay * 60000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", enr.id);
    }
  }

  return json({ ok: true, processed: due.length, sent, completed, failed });
});

async function complete(db: ReturnType<typeof createClient>, enrollmentId: string) {
  await db.from("sequence_enrollments")
    .update({ status: "completed", last_step_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", enrollmentId);
}

async function ensureConversation(db: ReturnType<typeof createClient>, contactId: string): Promise<string | null> {
  const { data: existing } = await db
    .from("conversations").select("id").eq("contact_id", contactId).eq("channel", "whatsapp").maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await db
    .from("conversations").insert({ contact_id: contactId, channel: "whatsapp", status: "open" }).select("id").single();
  return created?.id ?? null;
}

async function sendTemplate(
  db: ReturnType<typeof createClient>,
  waId: string,
  step: Record<string, unknown>,
  contactId: string,
  convId: string | null,
): Promise<boolean> {
  const payload = {
    messaging_product: "whatsapp",
    to: waId,
    type: "template",
    template: {
      name: step.template_name,
      language: { code: (step.template_language as string) ?? "en" },
      components: [],
    },
  };

  const res = await fetch(META_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${WHATSAPP_TOKEN}` },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  const waMessageId = (((body as Record<string, unknown>)?.messages as unknown[])?.[0] as Record<string, unknown>)?.id as string ?? null;

  if (convId) {
    await db.from("messages").insert({
      conversation_id: convId,
      contact_id: contactId,
      wa_message_id: waMessageId,
      direction: "out",
      type: "template",
      template_name: step.template_name as string,
      body: null,
      payload,
      status: res.ok ? "sent" : "failed",
      error: res.ok ? null : body,
    });
  }
  if (!res.ok) console.error("sequence template send failed", res.status, body);
  return res.ok;
}

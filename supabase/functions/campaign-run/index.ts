// campaign-run - cron-driven bulk WhatsApp campaign sender.
// Sends an approved template to each queued recipient (throttled batch), logs
// the message, and retries failures (incl. Meta "healthy ecosystem" rate caps)
// up to 3 times spread across ~24h. Auth: x-cron-secret or service role.
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
const BATCH = 30;                 // recipients per tick (once/min)

// Retries are scheduled for the NEXT day at 00:05 IST (India). A message that
// fails today is re-tried in the early hours of the next calendar day, giving
// Meta's "healthy ecosystem" rate-cap time to reset.
const IST_OFFSET_MS = 330 * 60 * 1000; // +05:30
function nextRetryAtISO(): string {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const y = nowIST.getUTCFullYear(), mo = nowIST.getUTCMonth(), d = nowIST.getUTCDate();
  return new Date(Date.UTC(y, mo, d + 1, 0, 5, 0) - IST_OFFSET_MS).toISOString();
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

serve(async (req: Request) => {
  const cron = req.headers.get("x-cron-secret");
  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const ok = (CRON_SECRET && cron === CRON_SECRET) || (auth && auth === SERVICE_ROLE);
  if (!ok) return json({ error: "Unauthorized" }, 401);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const nowIso = new Date().toISOString();

  // Due recipients from campaigns that are actively sending.
  const { data: due } = await db
    .from("campaign_recipients")
    .select("*, campaigns!inner(id, template_name, template_language, variables, status, header_image)")
    .in("status", ["queued", "retry"])
    .lte("next_attempt_at", nowIso)
    .eq("campaigns.status", "sending")
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH);

  if (!due || due.length === 0) {
    await completeFinishedCampaigns(db);
    return json({ ok: true, processed: 0 });
  }

  let sent = 0, failed = 0;
  const touched = new Set<string>();

  for (const r of due) {
    touched.add(r.campaign_id);
    const camp = r.campaigns as Record<string, unknown>;
    const attemptNo = (r.attempts as number) + 1;
    const priorLog = Array.isArray(r.attempt_log) ? (r.attempt_log as unknown[]) : [];
    const logWith = (entry: Record<string, unknown>) => [...priorLog, { n: attemptNo, at: nowIso, ...entry }];

    if (!r.contact_id) { // contact deleted
      await db.from("campaign_recipients").update({ status: "failed", error: "contact removed", last_attempt_at: nowIso, attempts: attemptNo, attempt_log: logWith({ ok: false, error: "contact removed" }) }).eq("id", r.id);
      failed++; continue;
    }

    try {
      // Ensure a conversation exists (leads who never messaged won't have one).
      let convId: string;
      const { data: conv } = await db.from("conversations").select("id").eq("contact_id", r.contact_id).eq("channel", "whatsapp").maybeSingle();
      if (conv) convId = conv.id;
      else {
        const { data: nc, error: ce } = await db.from("conversations").insert({ contact_id: r.contact_id, channel: "whatsapp", status: "open" }).select("id").single();
        if (ce || !nc) throw new Error("conversation create failed");
        convId = nc.id;
      }

      // Build components: optional image header + body params.
      const components: Record<string, unknown>[] = [];
      if (camp.header_image) {
        components.push({ type: "header", parameters: [{ type: "image", image: { link: String(camp.header_image) } }] });
      }
      const vars = (camp.variables as string[]) ?? [];
      if (vars.length) {
        components.push({ type: "body", parameters: vars.map((v) => ({ type: "text", text: v === "{{first_name}}" ? (r.first_name || "there") : String(v) })) });
      }

      const payload = {
        messaging_product: "whatsapp",
        to: r.wa_id,
        type: "template",
        template: { name: camp.template_name, language: { code: camp.template_language ?? "en" }, components },
      };

      const res = await fetch(META_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${WHATSAPP_TOKEN}` },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        const waMsgId = ((body?.messages as unknown[])?.[0] as Record<string, unknown>)?.id as string ?? null;
        await db.from("messages").insert({
          conversation_id: convId, contact_id: r.contact_id, wa_message_id: waMsgId,
          direction: "out", type: "template", template_name: camp.template_name, payload, status: "sent",
        });
        await db.from("campaign_recipients").update({ status: "sent", wa_message_id: waMsgId, attempts: attemptNo, last_attempt_at: nowIso, error: null, attempt_log: logWith({ ok: true }) }).eq("id", r.id);
        sent++;
      } else {
        const e = (body as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
        const msg = (e?.error_user_msg as string) || (e?.message as string) || `HTTP ${res.status}`;
        const code = (e?.code as number) ?? null;
        await scheduleRetryOrFail(db, r.id, attemptNo, r.max_attempts as number, msg, nowIso, logWith({ ok: false, error: msg, code }));
        failed++;
      }
    } catch (err) {
      await scheduleRetryOrFail(db, r.id, attemptNo, r.max_attempts as number, String(err), nowIso, logWith({ ok: false, error: String(err) }));
      failed++;
    }
  }

  await completeFinishedCampaigns(db, Array.from(touched));
  return json({ ok: true, processed: due.length, sent, failed });
});

async function scheduleRetryOrFail(db: ReturnType<typeof createClient>, id: string, attemptNo: number, maxAttempts: number, error: string, nowIso: string, log: unknown[]) {
  if (attemptNo >= (maxAttempts || 4)) {
    await db.from("campaign_recipients").update({ status: "failed", attempts: attemptNo, last_attempt_at: nowIso, error, attempt_log: log }).eq("id", id);
    return;
  }
  const next = nextRetryAtISO();
  await db.from("campaign_recipients").update({ status: "retry", attempts: attemptNo, last_attempt_at: nowIso, next_attempt_at: next, error, attempt_log: log }).eq("id", id);
}

// Mark campaigns completed once no recipients remain queued/retry.
async function completeFinishedCampaigns(db: ReturnType<typeof createClient>, ids?: string[]) {
  const q = db.from("campaigns").select("id").eq("status", "sending");
  const { data: sending } = ids && ids.length ? await q.in("id", ids) : await q;
  for (const c of sending ?? []) {
    const { count } = await db.from("campaign_recipients").select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id).in("status", ["queued", "retry"]);
    if ((count ?? 0) === 0) await db.from("campaigns").update({ status: "completed" }).eq("id", c.id);
  }
}

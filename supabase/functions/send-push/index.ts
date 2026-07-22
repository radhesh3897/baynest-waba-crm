// send-push — internal-only. Sends a Web Push notification to every stored
// browser subscription. Called by ingest-lead on a new lead.
// Auth: service-role bearer only. Deploy with verify_jwt = false.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Public key is safe to keep in code (matches the frontend); private key is a secret.
const VAPID_PUBLIC  = "BMR8pDFfApOrO4ln8ovUQX7zMMhb6BU2ZGX10NJkuwvfN-FCf4H4SuKhymenQRyTvkxLBpIyiVO_1-Eu36loqMU";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:radhesh3897@gmail.com";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token !== SERVICE_ROLE) return json({ error: "Unauthorized" }, 401);
  if (!VAPID_PRIVATE) return json({ error: "VAPID_PRIVATE_KEY not configured" }, 500);

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const { title, body, url } = await req.json().catch(() => ({}));
  const payload = JSON.stringify({
    title: title || "New lead",
    body: body || "A new lead just came in.",
    url: url || "/",
  });

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: subs } = await db.from("push_subscriptions").select("endpoint, p256dh, auth");

  let sent = 0;
  const gone: string[] = [];
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(s.endpoint); // expired/unsubscribed
    }
  }
  // Prune dead subscriptions.
  if (gone.length) await db.from("push_subscriptions").delete().in("endpoint", gone);

  return json({ ok: true, sent, removed: gone.length });
});

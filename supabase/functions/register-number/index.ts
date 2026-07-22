// register-number — DISABLED (security hardening).
// This was a one-time setup helper that exposed privileged WhatsApp WABA admin
// actions (send arbitrary text, number request_code/verify_code/register,
// webhook subscription, lead-PII dump) behind only the shared INGEST_SECRET.
// It is not called by the app or any cron job. Neutralized to remove the attack
// surface. To restore for a future number onboarding, recover the original from
// git history and gate it behind a dedicated admin secret + a real authenticated
// admin user.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve((_req: Request) =>
  new Response(JSON.stringify({ error: "This endpoint is disabled." }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);

// delete-template — deletes a message template on Meta and locally. verify_jwt = true.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN    = Deno.env.get("WHATSAPP_TOKEN")!;
const WABA_ID           = Deno.env.get("WHATSAPP_WABA_ID")!;
const META_API_VERSION  = Deno.env.get("META_API_VERSION") ?? "v21.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

// Require a genuine logged-in user (the public anon key satisfies verify_jwt, so
// validate the bearer is a real Supabase user before this destructive action).
async function requireUser(req: Request): Promise<Response | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token === SUPABASE_ANON_KEY) return json({ error: "Unauthorized" }, 401);
  if (token === SERVICE_ROLE) return null;
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) return json({ error: "Unauthorized" }, 401);
  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const denied = await requireUser(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const name = String(body.name ?? "").trim();
  if (!name) return json({ error: "Template name is required" }, 400);

  const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${WABA_ID}/message_templates?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${WHATSAPP_TOKEN}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
    const msg = (e?.error_user_msg as string) || (e?.message as string) || "Meta could not delete the template.";
    return json({ error: msg }, 502);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  await db.from("templates").delete().eq("name", name);
  return json({ ok: true });
});

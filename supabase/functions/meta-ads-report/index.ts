// meta-ads-report — month-by-month ad performance for the last N months
// (default 6). Spend / impressions / clicks / CTR / leads / cost-per-lead come
// from Meta; lead QUALITY (qualified vs not) comes from our own CRM, because
// Meta never sees how a lead was dispositioned — only what we send back to it.
//
// Auth: a logged-in app user (getUser) or service role; anon key is rejected.
// Deploy with verify_jwt = false (authorize() enforces access).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN             = Deno.env.get("META_ADS_TOKEN") || Deno.env.get("WHATSAPP_TOKEN") || "";
const V                 = Deno.env.get("META_API_VERSION") ?? "v21.0";
const ACT_ENV           = (Deno.env.get("META_AD_ACCOUNT_ID") ?? "").trim();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

async function authorize(req: Request): Promise<Response | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token === SUPABASE_ANON_KEY) return json({ error: "Unauthorized" }, 401);
  if (token === SERVICE_ROLE) return null;
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) return json({ error: "Unauthorized" }, 401);
  return null;
}

// Same resolution rule as meta-ads-insights: configured account, else the first
// one this token can actually read.
let _act = "";
async function resolveAct(): Promise<string> {
  if (ACT_ENV) return ACT_ENV.startsWith("act_") ? ACT_ENV : `act_${ACT_ENV}`;
  if (_act) return _act;
  const res = await fetch(`https://graph.facebook.com/${V}/me/adaccounts?fields=id,name,account_status&limit=25&access_token=${TOKEN}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`adaccounts lookup failed: ${JSON.stringify(j)}`);
  const list = (j as Record<string, unknown>).data as Record<string, unknown>[] ?? [];
  if (list.length === 0) throw new Error("This token cannot read any ad account. Assign it with ads_read, or set META_AD_ACCOUNT_ID.");
  const pick = list.find((a) => Number(a.account_status) === 1) ?? list[0];
  _act = String(pick.id);
  return _act;
}

// Meta reports one lead under several aliases; pick ONE so we never double-count.
function leadsOf(actions: unknown): number {
  if (!Array.isArray(actions)) return 0;
  const get = (t: string) =>
    Number((actions as Record<string, unknown>[]).find((a) => a.action_type === t)?.value || 0);
  return get("onsite_conversion.lead_grouped") || get("lead") || get("leadgen") || 0;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const denied = await authorize(req);
  if (denied) return denied;
  if (!TOKEN) return json({ error: "No META_ADS_TOKEN / WHATSAPP_TOKEN configured" }, 500);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const months = Math.min(Math.max(Number(body.months ?? 6), 1), 24);

  try {
    const ACT = await resolveAct();

    // Window: an explicit since/until (Ads-Manager style range) wins; otherwise
    // fall back to "start of the month N-1 months back → today".
    const now = new Date();
    const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const sinceStr = isDate(body.since) ? String(body.since)
      : ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)));
    const untilStr = isDate(body.until) ? String(body.until) : ymd(now);

    // Granularity: caller may force it, else day-by-day for short windows and
    // month-by-month for long ones (Meta caps a request at ~90 daily rows).
    const spanDays = Math.max(1, Math.round(
      (Date.parse(untilStr) - Date.parse(sinceStr)) / 86400000) + 1);
    const increment = ["1", "monthly", "all_days"].includes(String(body.increment))
      ? String(body.increment)
      : (spanDays <= 62 ? "1" : "monthly");

    const timeRange = encodeURIComponent(JSON.stringify({ since: sinceStr, until: untilStr }));

    const fields = "spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,actions,cost_per_action_type";
    const url = `https://graph.facebook.com/${V}/${ACT}/insights`
      + `?level=account&time_increment=${increment}&time_range=${timeRange}`
      + `&fields=${fields}&limit=200&access_token=${TOKEN}`;

    const res = await fetch(url);
    const j = await res.json();
    if (!res.ok) return json({ error: `Meta insights failed for ${ACT}`, status: res.status, detail: j }, 502);

    const rows = ((j as Record<string, unknown>).data as Record<string, unknown>[] ?? []).map((r) => {
      const spend  = Number(r.spend || 0);
      const leads  = leadsOf(r.actions);
      const clicks = Number(r.inline_link_clicks || r.clicks || 0);
      return {
        // Bucket key: the day for daily rows, YYYY-MM for monthly ones.
        key: increment === "1" ? String(r.date_start ?? "") : String(r.date_start ?? "").slice(0, 7),
        month: String(r.date_start ?? "").slice(0, 7),      // YYYY-MM
        date_start: r.date_start, date_stop: r.date_stop,
        spend,
        impressions: Number(r.impressions || 0),
        reach: Number(r.reach || 0),
        clicks,
        ctr: Number(r.ctr || 0),
        cpc: Number(r.cpc || 0),
        leads,
        cpl: leads > 0 ? spend / leads : null,
      };
    });

    // Lead quality per month, straight from the CRM (service role bypasses RLS).
    const db = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: quality } = await db.rpc("lead_quality_monthly", { p_months: months });

    return json({
      ok: true,
      account: ACT,
      range: { since: sinceStr, until: untilStr, increment, days: spanDays },
      months: rows.sort((a, b) => String(a.key).localeCompare(String(b.key))),
      quality: quality ?? [],
      asOf: new Date().toISOString(),
    });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

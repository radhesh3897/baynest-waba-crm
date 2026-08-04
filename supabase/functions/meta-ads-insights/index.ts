// meta-ads-insights — read-only Meta Ads dashboard data for the client's ad
// account, using a Meta system-user token (META_ADS_TOKEN, ads_read).
// Auth: a logged-in app user (getUser) or service role; anon key is rejected.
// Deploy with verify_jwt = false (authorize() enforces access).
//
// The ad account is NOT hardcoded: set META_AD_ACCOUNT_ID, or leave it unset and
// the function discovers the first account the token can actually read.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Prefer a dedicated ads token. Falls back to the WhatsApp system-user token,
// which works as long as it carries ads_read.
const TOKEN             = Deno.env.get("META_ADS_TOKEN") || Deno.env.get("WHATSAPP_TOKEN") || "";
const V                 = Deno.env.get("META_API_VERSION") ?? "v21.0";
// Optional. Accepts "act_123..." or bare "123...". Empty => auto-discover.
const ACT_ENV           = (Deno.env.get("META_AD_ACCOUNT_ID") ?? "").trim();
// Target cost-per-lead for the benchmark banner. 0/unset hides the comparison.
const BENCHMARK_CPL     = Number(Deno.env.get("META_BENCHMARK_CPL") ?? "0") || null;

// Resolve the ad account: use the configured one, else ask Meta which accounts
// this token can read and take the first. Avoids hardcoding a client's account.
let _actCache = "";
async function resolveAct(): Promise<string> {
  if (ACT_ENV) return ACT_ENV.startsWith("act_") ? ACT_ENV : `act_${ACT_ENV}`;
  if (_actCache) return _actCache;
  const res = await fetch(
    `https://graph.facebook.com/${V}/me/adaccounts?fields=id,name,account_status&limit=25&access_token=${TOKEN}`,
  );
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`adaccounts lookup failed: ${JSON.stringify(j)}`);
  const list = (j as Record<string, unknown>).data as Record<string, unknown>[] ?? [];
  if (list.length === 0) throw new Error("This token cannot read any ad account. Assign the ad account to the system user with ads_read, or set META_AD_ACCOUNT_ID.");
  // Prefer an ACTIVE account (status 1) when the token can see several.
  const pick = list.find((a) => Number(a.account_status) === 1) ?? list[0];
  _actCache = String(pick.id);
  return _actCache;
}

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

// Meta reports the SAME lead under several aliases (e.g. "lead" and
// "onsite_conversion.lead_grouped"). Summing them double-counts, so pick ONE
// canonical value in priority order — prefer the grouped on-Facebook lead-form
// metric, then the generic lead, then legacy leadgen.
function sumLeads(actions: unknown): number {
  if (!Array.isArray(actions)) return 0;
  const get = (t: string) =>
    Number((actions as Record<string, unknown>[]).find((a) => a.action_type === t)?.value || 0);
  return get("onsite_conversion.lead_grouped") || get("lead") || get("leadgen") || 0;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const denied = await authorize(req);
  if (denied) return denied;
  if (!TOKEN) return json({ error: "No META_ADS_TOKEN / WHATSAPP_TOKEN configured" }, 500);

  try {
    // Which ad account? Configured, or discovered from the token.
    const ACT = await resolveAct();

    // 1) Account node (name, currency, timezone)
    const acctRes = await fetch(`https://graph.facebook.com/${V}/${ACT}?fields=name,currency,timezone_name,account_status&access_token=${TOKEN}`);
    const account = await acctRes.json();
    if (!acctRes.ok) return json({ error: `Meta account read failed for ${ACT}`, status: acctRes.status, detail: account }, 502);

    // 2) Account-level insights for today (account timezone)
    const insFields = "spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,actions,cost_per_action_type";
    const insRes = await fetch(`https://graph.facebook.com/${V}/${ACT}/insights?level=account&date_preset=today&fields=${insFields}&access_token=${TOKEN}`);
    const insJson = await insRes.json();
    if (!insRes.ok) return json({ error: "Meta insights failed", status: insRes.status, detail: insJson }, 502);
    const row = (insJson.data && insJson.data[0]) || {};

    const spend = Number(row.spend || 0);
    const leads = sumLeads(row.actions);
    const linkClicks = Number(row.inline_link_clicks || 0);
    const clicks = Number(row.clicks || 0);

    // 3) Active ads today, by spend
    const adFields = "ad_name,spend,impressions,clicks,ctr,cpc,actions";
    const filt = encodeURIComponent(JSON.stringify([
      { field: "ad.effective_status", operator: "IN", value: ["ACTIVE"] },
      { field: "impressions", operator: "GREATER_THAN", value: 0 },
    ]));
    const adsRes = await fetch(`https://graph.facebook.com/${V}/${ACT}/insights?level=ad&date_preset=today&fields=${adFields}&filtering=${filt}&sort=spend_descending&limit=15&access_token=${TOKEN}`);
    const adsJson = await adsRes.json();
    const ads = (adsRes.ok && Array.isArray(adsJson.data) ? adsJson.data : []).map((a: Record<string, unknown>) => {
      const s = Number(a.spend || 0); const l = sumLeads(a.actions);
      return { name: a.ad_name, spend: s, leads: l, cpl: l ? s / l : null, cpc: Number(a.cpc || 0), ctr: Number(a.ctr || 0), impressions: Number(a.impressions || 0), clicks: Number(a.clicks || 0) };
    });

    return json({
      ok: true,
      account: { id: ACT, name: account.name, currency: account.currency, timezone: account.timezone_name },
      asOf: new Date().toISOString(),
      benchmarkCpl: BENCHMARK_CPL,
      totals: {
        spend, leads,
        cpl: leads ? spend / leads : null,
        ctr: Number(row.ctr || 0),
        cpc: Number(row.cpc || 0),
        impressions: Number(row.impressions || 0),
        reach: Number(row.reach || 0),
        clicks, linkClicks,
      },
      ads,
    });
  } catch (e) {
    return json({ error: "exception", detail: String(e) }, 500);
  }
});

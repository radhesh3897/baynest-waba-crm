# Client Build Checklist — Phase by Phase

The end-to-end plan to stand up the WhatsApp CRM for a new client. Tailored for
**Baynest Realty** (infra = Manish/Baynest-owned), but reusable for any client.
Depth for each step is in [`REPLICATION-BIBLE.md`](REPLICATION-BIBLE.md); the two
edit points are in [`../TEMPLATE-SETUP.md`](../TEMPLATE-SETUP.md).

**Owner key:** 👤 Manish/Baynest · 🛠️ Radhesh (build) · 🤝 both

---

## Phase overview

| # | Phase | Owner | Depends on | Slowest part |
|---|-------|-------|-----------|--------------|
| 0 | Accounts & access | 👤 | — | — |
| 1 | Meta app + WhatsApp number | 👤🤝 | 0 | **Business verification (days)** |
| 2 | Supabase backend | 🛠️ | 0 (Supabase project) | — |
| 3 | Template customization (brand + AI) | 🛠️ | 2 | — |
| 4 | Frontend deploy (Vercel) | 🛠️ | 2, 3 | — |
| 5 | Meta tracking (pixel + CTWA dataset) | 🛠️🤝 | 1 | dataset↔app link |
| 6 | n8n lead-form ingestion *(only if they run Lead Forms)* | 🛠️🤝 | 1, 2 | — |
| 7 | Go-live testing | 🤝 | all | — |

> **Start Phase 1 (Meta verification) and Phase 0 (Supabase project) on day one** —
> everything else waits on them.

---

## Phase 0 — Accounts & access  👤
Manish creates each, then adds Radhesh (`radhesh3897@gmail.com`) as collaborator.

- [ ] **Supabase** — new project (Mumbai region), set DB password → invite Radhesh (Owner/Admin)
- [ ] **Vercel** — account/team → invite Radhesh
- [ ] **Anthropic** — console.anthropic.com, add billing, create an API key → share securely (goes into a Supabase secret, never chat)
- [ ] **GitHub** — repo to hold Baynest's copy (Radhesh owns + adds Manish, or vice-versa)
- [ ] 🛠️ **Reconnect the Supabase MCP** to Baynest's project (Personal Access Token) before any SQL/deploys

## Phase 1 — Meta app + WhatsApp Cloud API  👤🤝
- [ ] Baynest **Business Manager** → add Radhesh as admin
- [ ] **Start Business Verification** (slowest item — do first)
- [ ] Create a **Meta App** (type Business) under the portfolio → note App ID + App Secret
- [ ] Add the **WhatsApp** product; create/select the **WABA**
- [ ] Add + OTP-verify the **WhatsApp number** (must NOT be on the normal WhatsApp app)
- [ ] Note **Phone Number ID**, **WABA ID**, display number
- [ ] Create a **System User** (Admin) → assign App + WABA + Page + Ad Account → generate a **permanent token** with: `whatsapp_business_messaging`, `whatsapp_business_management`, `business_management`, `pages_show_list`, `pages_read_engagement`, `leads_retrieval`, `ads_management`, `ads_read`
- [ ] (Webhook is wired in Phase 2 once the Supabase URL exists)

## Phase 2 — Supabase backend  🛠️
- [ ] Enable extensions **`pg_cron`** + **`pg_net`**
- [ ] Apply the **17 migrations** in `supabase/migrations/` (full schema incl. AI qualifier + CTWA)
- [ ] Create storage bucket **`wa-media`** (public read) + apply bucket-listing lockdown
- [ ] Set all **Edge Function secrets** (see table below)
- [ ] Deploy the **edge functions** with correct JWT flags (bible §3.6) — public/cron ones `--no-verify-jwt`
- [ ] Wire the **webhook** in Meta: callback `https://<ref>.supabase.co/functions/v1/whatsapp-webhook`, verify token = `WHATSAPP_VERIFY_TOKEN`, subscribe field **messages**
- [ ] Schedule the **6 cron jobs** (bible §3.7)
- [ ] Seed the **`app_settings`** row (`business_name`, `business_number`, `ai_qualify_enabled=false`)
- [ ] 👤 Create the **Auth login user** (Manish, in dashboard — Radhesh cannot create credentials) + insert matching `profiles` row (owner first)
- [ ] Run **Advisors → Security** → fix all criticals; enable leaked-password protection

**Secrets to set (Phase 2):**

| Secret | Source |
|--------|--------|
| `WHATSAPP_TOKEN` | permanent system-user token (Phase 1) |
| `WHATSAPP_VERIFY_TOKEN` | invent a random string (must match webhook) |
| `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_WABA_ID` | Phase 1 |
| `META_APP_ID` / `META_APP_SECRET` | Phase 1 |
| `META_API_VERSION` | e.g. `v23.0` |
| `META_CAPI_PIXEL_ID` | Phase 5 |
| `META_MESSAGING_DATASET_ID` | Phase 5 |
| **`ANTHROPIC_API_KEY`** | Phase 0 (the only place Anthropic lives) |
| `QUALIFY_MODEL` | optional; default `claude-haiku-4-5` |
| `CRON_SECRET` | invent (must match the cron jobs) |
| `INGEST_SECRET` | invent (must match the n8n workflow — Phase 6) |
| `RESEND_API_KEY` | Resend (email notifications) |
| `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | `npx web-push generate-vapid-keys` |

## Phase 3 — Template customization  🛠️
- [ ] **`src/config/client.js`** → Baynest name, shortName, tagline, logo, 4 brand colours
- [ ] Drop the logo at **`public/assets/logo.png`**
- [ ] **`ai-qualify` CLIENT block** → realty persona + company facts + questions:
      **budget, preferred area/location, buy vs rent, property type, possession timeline**;
      `earlyStops: []` (no affiliate/buy-leads logic for realty)
- [ ] Sweep residual "Done For You" strings (MetaDashboard, Stub, Templates, demo data)
- [ ] Test the AI via curl (service-role bearer) — tone + grounding + tokens
- [ ] Flip `ai_qualify_enabled=true` once the prompt is client-ready

## Phase 4 — Frontend deploy (Vercel)  🛠️
- [ ] Push Baynest's repo → import into **Vercel** (framework Vite, build `npm run build`, output `dist`)
- [ ] Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Baynest's project)
- [ ] Add the Vercel domain to Supabase Auth → URL Configuration
- [ ] Log in with the Phase 2 user; confirm realtime + inbox

## Phase 5 — Meta tracking  🛠️🤝
- [ ] **CRM Pixel** (dataset) → ID into `META_CAPI_PIXEL_ID`; system user has CAPI access
- [ ] **CTWA messaging dataset** → ID into `META_MESSAGING_DATASET_ID`
- [ ] ⚠️ **Link the Meta App to the CTWA dataset** (Events Manager) — the step that silently drops events if skipped
- [ ] Give the **Ad Account** access to the dataset
- [ ] Fire a **test event** (Test Events tab) and confirm it records

## Phase 6 — n8n lead-form ingestion  🛠️🤝
*(Only if Baynest runs Meta **Lead Forms**. CTWA-only clients skip this.)* — see the n8n section below.

## Phase 7 — Go-live testing  🤝
- [ ] Fresh number → AI greets + typing indicator
- [ ] Full qualify → no re-asking → assigned to owner → Qualified fires on CRM pixel
- [ ] Voice note → playable in Inbox
- [ ] Human reply from Inbox → AI goes silent for that chat
- [ ] Go quiet mid-chat → 20-min nudge fires once
- [ ] Kill switch (WhatsApp Settings) silences new chats
- [ ] `cron.job_run_details` → all succeeded
- [ ] CTWA test event visible in Events Manager
- [ ] Anon curl of `ai_qualify_candidates` RPC → 401

---

# n8n — Meta Lead Forms → Supabase

Only needed if the client runs **Meta Lead Forms** (the native instant-form ad).
Leads that arrive via **Click-to-WhatsApp** need no n8n — they hit the WhatsApp
webhook directly. File: `n8n/dfy-whatsapp-meta-leads-workflow.json`.

## The 3 external connections

```
                    (1) lead submitted
   Meta Lead Form ───────────────────────►  n8n webhook
   (Page, leadgen)     POST /webhook/…       (your n8n host)
                                                  │
                                (2) fetch lead    │  Page Access Token
                          ◄───────────────────────┤
   Meta Graph API  ──────────────────────────────►│  (lead field_data)
                                                  │
                                (3) create contact │  x-ingest-secret
                                                  ▼
                              Supabase  ingest-lead  ──►  contacts table
                              (edge function, verify_jwt off)
```

| # | From → To | Auth | Purpose |
|---|-----------|------|---------|
| 1 | Meta (Page, `leadgen`) → n8n webhook | Meta verify token (GET challenge) | Meta pings n8n on every new lead |
| 2 | n8n → Meta Graph API | **Page Access Token** | Pull the lead's actual field data |
| 3 | n8n → Supabase `ingest-lead` | **`x-ingest-secret`** header | Insert the lead as a contact |

## Internal node chain (inside n8n)

**Verification path (GET)** — Meta calls this once when you register the webhook:
```
Meta Verify Challenge ──► Respond with Challenge
```

**Lead path (POST)** — runs on every lead submission:
```
Meta Lead Trigger ──► ① Config (Meta token) ──► Extract Lead ID ──►
Get Page Token ──► Fetch Lead from Meta ──► Parse Lead Fields ──►
Send to WhatsApp Tool ──► Respond to Meta
```
- **① Config** — holds the Meta token
- **Extract Lead ID / Get Page Token / Fetch Lead from Meta** — Graph API calls (connection 2)
- **Parse Lead Fields** — maps the form's internal field names → contact fields
- **Send to WhatsApp Tool** — POST to `ingest-lead` (connection 3)

## What to change per client (n8n)

- [ ] Set **`INGEST_SECRET`** in Supabase secrets = a **fresh** value; put the same value in the **Send to WhatsApp Tool** node's `x-ingest-secret` header
- [ ] **Send to WhatsApp Tool** URL → `https://<baynest-ref>.supabase.co/functions/v1/ingest-lead`
- [ ] **① Config** node → Baynest's Meta token; **Extract Lead ID** → the Page ID
- [ ] **Parse Lead Fields** → map Baynest's form's **internal field names** (case-sensitive)
- [ ] (Optional) rename the webhook **path**

## Connect the Page to Meta (one time)

- [ ] Subscribe the page to leadgen: `POST graph.facebook.com/v21.0/<PAGE_ID>/subscribed_apps` with `subscribed_fields=leadgen` + page token → expect `{"success": true}`
- [ ] Enable **Access Leads** for the n8n app: facebook.com/leads/access → select page → ON
- [ ] Register the webhook in the Meta app → Webhooks (Page): callback `https://<n8n-host>/webhook/<path>`, verify token (any string), subscribe **leadgen**. **Publish the workflow first.**

## Test (n8n)
- [ ] developers.facebook.com/tools/lead-ads-testing → create a test lead → Track Status green
- [ ] n8n Executions → all nodes green
- [ ] Supabase → `contacts` → new row, `source = Meta Lead Ads`

## Need from Manish (n8n)
- Facebook **Page ID** · the form's **internal field names** · the **n8n host URL**

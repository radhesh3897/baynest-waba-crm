# DFY WhatsApp CRM — Replication Bible

**How to rebuild this entire tool from scratch for a new company/client.**

This is the single source of truth for cloning the system. Follow the phases **in order** —
each phase depends on the one before it. Everything in `<angle brackets>` is a value you
must replace for the new company. Never commit real tokens/keys to git; they live only in
Supabase Edge Function Secrets, Vercel env vars, or n8n credentials.

---

## 0. What this tool is (read first)

A WhatsApp-based sales CRM + AI lead-qualifier. One Vite/React frontend, one Supabase
project doing all backend work, Meta's WhatsApp Cloud API for messaging, Anthropic Claude
for the AI qualifier, and Meta Conversions API for ad optimization signals.

```
Lead clicks WhatsApp ad ──► WhatsApp Cloud API ──► whatsapp-webhook (Supabase Edge Fn)
                                                        │
                       stores message ◄─────────────────┤
                       (contacts / conversations /      │
                        messages tables)                ▼
                                                  ai-qualify  ──► Claude (Haiku)
                                                        │
                              reply sent via send-message ──► WhatsApp Cloud API
                                                        │
                     on qualified: capi-lead-event ──► Meta CRM Pixel (Qualified)
                                   ctwa-conversion ──► Meta Messaging Dataset (LeadSubmitted)
                                                        │
   Team works leads in the React Inbox (Vercel) ◄───────┘
   pg_cron (every minute) ──► ai-qualify-catchup   (recovers dropped replies + sends nudges)
                          ──► campaign-run / process-flows / process-sequences / sync-*
```

**The four moving parts:**

| Part | Where it lives | What it does |
|---|---|---|
| Frontend (Inbox, CRM, Campaigns, Templates, Automation, Settings) | Vercel (Vite + React 19 + Tailwind v4) | Team UI. Talks to Supabase directly (RLS) + calls edge functions |
| Backend | Supabase (Postgres + 22 Edge Functions + pg_cron + Storage + Auth) | All logic. WhatsApp in/out, AI brain, Meta events, campaigns, flows |
| Messaging | Meta WhatsApp Cloud API | The actual WhatsApp business number |
| AI | Anthropic API (Claude Haiku 4.5 by default) | "Saloni" — greets, qualifies, hands off |

---

## 1. Prerequisites — what the NEW company must have BEFORE you start

Collect ALL of this first. Missing any one of these blocks a phase later.

1. **A Meta Business Portfolio (Business Manager)** the client controls, with admin access for you.
2. **A phone number for WhatsApp** that is NOT currently registered on the normal WhatsApp
   app (or they must delete the account first). It will receive one SMS/voice OTP.
3. **A Facebook Page** owned by that Business Portfolio (needed for WABA + CTWA ads).
4. **An Ad Account** in the same portfolio (for CTWA ads, insights, datasets).
5. **A verified business** (Meta Business Verification) — needed for higher messaging
   limits and smooth CAPI access. Start verification early; it can take days.
6. **Accounts you create:** Supabase (new project), Vercel (new project), Anthropic
   (API key with billing), optionally n8n + Resend.
7. **From the client, in writing:** business name, what the company actually does and
   does NOT do (this feeds the AI prompt — see §6.3), the qualifying questions they want
   asked, who "the expert" is that qualified leads are handed to, and the login email
   for the inbox user.

---

## 2. Phase 1 — Meta App + WhatsApp Cloud API

### 2.1 Create the Meta App
1. developers.facebook.com → Create App → type **Business** → link it to the client's
   Business Portfolio.
2. Note the **App ID** and **App Secret** (App Settings → Basic). → these become
   `META_APP_ID` and `META_APP_SECRET` secrets later.
3. Add the **WhatsApp** product to the app.

### 2.2 WhatsApp Business Account (WABA) + number
1. In the app's WhatsApp setup, create/select a **WABA** under the client's portfolio.
2. Add the real phone number, verify via OTP.
3. Note these three IDs (WhatsApp → API Setup page):
   - **Phone Number ID** → `WHATSAPP_PHONE_NUMBER_ID`
   - **WABA ID** → `WHATSAPP_WABA_ID`
   - The display number itself (goes into `app_settings.business_number` later).

### 2.3 Permanent access token (do NOT use the 24h temp token)
1. Business Settings → Users → **System Users** → create a system user (Admin).
2. Assign assets to it: the App, the WABA, the Page, the Ad Account, and later the
   Pixel/Dataset.
3. Generate a token with **no expiry** and these permissions:
   `whatsapp_business_messaging`, `whatsapp_business_management`, `business_management`,
   `pages_show_list`, `pages_read_engagement`, `leads_retrieval` (for lead forms),
   `ads_management`, `ads_read` (for insights + CAPI).
4. This one token becomes `WHATSAPP_TOKEN`. (The code also reads `META_CAPI_TOKEN`,
   `META_CTWA_TOKEN`, `META_ADS_TOKEN` but **falls back to `WHATSAPP_TOKEN`** — one
   system-user token with all permissions is the simplest setup.)

### 2.4 Webhook (do this AFTER Phase 2 — the URL doesn't exist yet)
1. App → WhatsApp → Configuration → Webhook:
   - Callback URL: `https://<new-project-ref>.supabase.co/functions/v1/whatsapp-webhook`
   - Verify token: invent a random string → this is `WHATSAPP_VERIFY_TOKEN` (must match
     the Supabase secret exactly).
2. Subscribe to webhook fields: **messages** (that one field carries inbound messages,
   statuses, and CTWA referral data).
3. Send a test message to the business number and confirm a row lands in
   `webhook_events` + `messages`.

---

## 3. Phase 2 — Supabase (the backend)

### 3.1 Create project
- New Supabase project (free tier is fine to start). Note the **project ref**, the
  **anon key**, and the **service_role key** (Project Settings → API).
- Enable extensions: `pg_cron` and `pg_net` (Database → Extensions). Both are required
  for the every-minute ticks.

### 3.2 Database schema — IMPORTANT REPLICATION NOTE
The repo's `supabase/migrations/` folder is **incomplete**: everything up to
`20260711000001_security_perf_hardening.sql` is in the repo, but the later migrations
were applied straight to the live DB via MCP and exist only there:

`ctwa_conversion_capture`, `contacts_source_type`, `ai_qualifier_state`,
`ai_qualifier_catchup`, `tag_buy_leads`, `ai_qualifier_followups`,
`lock_down_ai_qualifier_functions`, `tag_contact_generic`.

**The reliable way to replicate the schema is to dump it from the source project:**

```bash
# from the dfy-inbox repo, logged into the SOURCE project
supabase db dump --db-url "postgresql://postgres:<SOURCE_DB_PASSWORD>@db.rkmngnkgesteohigvsxe.supabase.co:5432/postgres" -f schema.sql
# then apply to the NEW project (SQL Editor, or psql against the new db-url)
```

Sanity-check the dump contains: all 22 `public.*` tables (contacts, conversations,
messages, templates, campaigns, campaign_recipients, flows, flow_nodes, flow_edges,
flow_runs, sequences, sequence_steps, sequence_enrollments, fb_pages, fb_forms,
contact_notes, profiles, team_members, app_settings, webhook_events, push_subscriptions,
tracking_leads), the AI-qualifier functions (`ai_qualify_candidates`, `ai_qualify_claim`,
`ai_followup_candidates`, `ai_followup_claim`, `tag_buy_leads`, `tag_contact`), all
RLS policies, and the budget/alert triggers.

**After applying, re-run the security lockdown on the new project** (SECURITY DEFINER
functions MUST NOT be callable with the public anon key — this was a real leak we found):

```sql
revoke all on function public.ai_qualify_candidates(int) from public, anon, authenticated;
revoke all on function public.ai_qualify_claim(uuid) from public, anon, authenticated;
revoke all on function public.ai_followup_candidates(int) from public, anon, authenticated;
revoke all on function public.ai_followup_claim(uuid, int) from public, anon, authenticated;
revoke all on function public.tag_buy_leads(uuid) from public, anon, authenticated;
revoke all on function public.tag_contact(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_qualify_candidates(int) to service_role;
grant execute on function public.ai_qualify_claim(uuid) to service_role;
grant execute on function public.ai_followup_candidates(int) to service_role;
grant execute on function public.ai_followup_claim(uuid, int) to service_role;
grant execute on function public.tag_buy_leads(uuid) to service_role;
grant execute on function public.tag_contact(uuid, text) to service_role;
```

Then run Supabase **Advisors → Security** and fix anything red before go-live.
(Gotcha learned the hard way: `REVOKE ... FROM anon, authenticated` alone is a NO-OP
because the default `PUBLIC` grant remains — you must revoke from `public` too.)

### 3.3 Storage
- Create bucket **`wa-media`** (public read). Inbound voice notes/images/documents are
  downloaded into it by `fetch-inbound-media`; outbound media uploads also use it.
- Apply the bucket-listing lockdown from `20260711000001_security_perf_hardening.sql`
  so anonymous users can't LIST the bucket contents.

### 3.4 Auth (the inbox login)
- Supabase Auth → create the team user(s) manually (email + password). The app has no
  self-signup.
- Insert a matching row in `public.profiles` (the AI hand-off assigns conversations to
  the **oldest profile row**, so create the owner's profile first).
- Recommended: Auth → enable **leaked password protection**.

### 3.5 Edge Function secrets (Project Settings → Edge Functions → Secrets)
Set ALL of these before deploying functions:

| Secret | Value | Used by |
|---|---|---|
| `WHATSAPP_TOKEN` | permanent system-user token (§2.3) | everything WhatsApp |
| `WHATSAPP_VERIFY_TOKEN` | random string, must match webhook config | whatsapp-webhook |
| `WHATSAPP_PHONE_NUMBER_ID` | from §2.2 | send-message, webhook, campaigns |
| `WHATSAPP_WABA_ID` | from §2.2 | templates, ctwa-conversion |
| `META_APP_ID` | from §2.1 | get-media-handle |
| `META_APP_SECRET` | from §2.1 (webhook signature check) | whatsapp-webhook |
| `META_API_VERSION` | e.g. `v23.0` | all Meta calls |
| `META_CAPI_PIXEL_ID` | the CRM pixel (§5.1) | capi-lead-event |
| `META_CAPI_TOKEN` | CAPI token (or omit → falls back to WHATSAPP_TOKEN) | capi-lead-event |
| `META_MESSAGING_DATASET_ID` | CTWA dataset id (§5.2) | ctwa-conversion |
| `META_CTWA_TOKEN` | optional, falls back to WHATSAPP_TOKEN | ctwa-conversion |
| `META_ADS_TOKEN` | optional, falls back to WHATSAPP_TOKEN | meta-ads-insights |
| `ANTHROPIC_API_KEY` | **this is where Anthropic goes** — nowhere else | ai-qualify |
| `QUALIFY_MODEL` | optional; default `claude-haiku-4-5` | ai-qualify |
| `CRON_SECRET` | random 32+ chars; must match the cron jobs (§3.7) | all cron-called fns |
| `INGEST_SECRET` | random 32+ chars; must match n8n workflow header | ingest-lead |
| `RESEND_API_KEY` | Resend key (email notifications) | notify |
| `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | web-push keypair (generate with `npx web-push generate-vapid-keys`) | send-push |

(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected by
Supabase automatically — don't set them.)

**One code edit per new project:** `ai-qualify/index.ts` has an `ALLOWED` set of accepted
bearer keys that includes the OLD project's publishable key hard-coded. Replace it with
the NEW project's publishable/anon key (or delete the hard-coded entries — the env-based
`SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` entries are what matter).

### 3.6 Deploy the Edge Functions
All sources are in `supabase/functions/<name>/index.ts`. Deploy with the CLI from the
repo root, using the correct JWT setting per function — **this matters**: functions Meta
or cron must reach cannot require a Supabase JWT.

```bash
supabase link --project-ref <new-project-ref>

# verify_jwt = FALSE (public/cron/Meta-facing — they do their own auth internally):
supabase functions deploy whatsapp-webhook      --no-verify-jwt
supabase functions deploy ai-qualify            --no-verify-jwt
supabase functions deploy ai-qualify-catchup    --no-verify-jwt
supabase functions deploy fetch-inbound-media   --no-verify-jwt
supabase functions deploy capi-lead-event       --no-verify-jwt
supabase functions deploy ctwa-conversion       --no-verify-jwt
supabase functions deploy campaign-run          --no-verify-jwt
supabase functions deploy process-flows         --no-verify-jwt
supabase functions deploy process-sequences     --no-verify-jwt
supabase functions deploy sync-templates        --no-verify-jwt
supabase functions deploy sync-forms            --no-verify-jwt
supabase functions deploy ingest-lead           --no-verify-jwt
supabase functions deploy notify                --no-verify-jwt
supabase functions deploy meta-ads-insights     --no-verify-jwt
supabase functions deploy send-push             --no-verify-jwt

# verify_jwt = TRUE (called by the logged-in frontend):
supabase functions deploy send-message
supabase functions deploy send-media
supabase functions deploy get-media-handle
supabase functions deploy create-template
supabase functions deploy delete-template
supabase functions deploy send-template-test
supabase functions deploy register-number
```

(Skip `ctwa-test` — it was a throwaway diagnostic; don't replicate it.)

**What each function does (so you know what broke when something breaks):**

| Function | Role |
|---|---|
| `whatsapp-webhook` | THE front door. Verifies Meta signature, stores inbound messages/statuses, captures CTWA `referral` (ctwa_clid), triggers AI qualifier for first-time chats, fires media fetch. Uses `EdgeRuntime.waitUntil` — do not remove it |
| `ai-qualify` | The AI "brain". Stateless: history in → next reply out (`{reply, done, outcome}`). All persona/company knowledge lives in its `systemPrompt` |
| `ai-qualify-catchup` | Every-minute safety net: recovers dropped replies + sends the 20-min / 20-h nudges. Guards live in SQL functions |
| `send-message` | Outbound text. Also the human-takeover hook: a human sending flips `ai_status` active→off |
| `send-media`, `get-media-handle` | Outbound media + Meta resumable-upload handles |
| `fetch-inbound-media` | Downloads inbound media (2-hop: id→url→bytes, both need token) into `wa-media` |
| `sync-templates`, `create-template`, `delete-template`, `send-template-test` | WhatsApp template CRUD + hourly sync |
| `campaign-run` | Broadcast campaign sender (per-minute batches, per-recipient logs) |
| `process-flows`, `process-sequences` | Automation engines (visual flow-builder, timed sequences) |
| `sync-forms`, `ingest-lead` | Meta lead-form sync + n8n lead ingestion (x-ingest-secret) |
| `capi-lead-event` | Fires Lead/Qualified events to the CRM pixel via CAPI |
| `ctwa-conversion` | Fires LeadSubmitted to the CTWA messaging dataset (`business_messaging` + ctwa_clid) |
| `notify` | Email notifications via Resend |
| `send-push` | Web-push notifications (VAPID) |
| `meta-ads-insights` | Ad spend/insights for the Meta dashboard screen |
| `register-number` | One-time Cloud API number registration helper |

### 3.7 Cron jobs (SQL Editor on the NEW project)
Replace `<REF>` and `<CRON_SECRET>` (same value as the secret in §3.5):

```sql
select cron.schedule('process-sequences-tick', '* * * * *', $$
  select net.http_post(url := 'https://<REF>.supabase.co/functions/v1/process-sequences',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb)$$);

select cron.schedule('process-flows-tick', '* * * * *', $$
  select net.http_post(url := 'https://<REF>.supabase.co/functions/v1/process-flows',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb)$$);

select cron.schedule('sync-templates-tick', '*/5 * * * *', $$
  select net.http_post(url := 'https://<REF>.supabase.co/functions/v1/sync-templates',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb)$$);

select cron.schedule('sync-forms-tick', '0 * * * *', $$
  select net.http_post(url := 'https://<REF>.supabase.co/functions/v1/sync-forms',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb)$$);

select cron.schedule('campaign-run', '* * * * *', $$
  select net.http_post(url := 'https://<REF>.supabase.co/functions/v1/campaign-run',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb)$$);

select cron.schedule('ai-qualify-catchup-tick', '* * * * *', $$
  select net.http_post(url := 'https://<REF>.supabase.co/functions/v1/ai-qualify-catchup',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb)$$);
```

Verify: `select jobid, jobname, schedule from cron.job;` → 6 rows. Then check
`select * from cron.job_run_details order by start_time desc limit 5;` after a minute —
statuses should be `succeeded`.

### 3.8 Seed `app_settings`
One row drives global behavior. Insert it (id=1):

```sql
insert into public.app_settings
  (id, business_name, business_number, ai_qualify_enabled, notify_new_lead, notify_inbound)
values (1, '<Company Name>', '<+91 XXXXX XXXXX>', false, true, false);
```

Keep `ai_qualify_enabled=false` until the AI prompt is rewritten for the company (§6.3)
and tested. It's the kill switch — the WhatsApp Settings screen toggles it.

---

## 4. Phase 3 — Frontend on Vercel

1. Push the repo to the new client's GitHub repo (or a branch/fork of `radhesh3897/DFY-WhatsApp-API`).
2. Vercel → New Project → import repo. Framework: **Vite**. Build `npm run build`,
   output `dist`. (No `vercel.json` is needed — the app is a single-page app served
   from `index.html`.)
3. Environment variables (all environments):
   - `VITE_SUPABASE_URL` = `https://<new-project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = new project's anon/publishable key
4. Deploy, open the URL, log in with the Auth user from §3.4.
5. Supabase → Authentication → URL Configuration → add the Vercel domain to allowed
   redirect origins.

That's ALL Vercel does — it's a static host. Every secret lives in Supabase, none in Vercel
except the two public `VITE_*` values.

---

## 5. Phase 4 — Meta tracking (pixels + datasets)

Two separate destinations. Don't confuse them (we did, and lost days):

### 5.1 CRM Pixel (website-style dataset) — "Qualified" events
1. Events Manager → create a **dataset/pixel** for the client (this project's was
   `27386246781031389`).
2. Give the **system user** access to it; generate/confirm a token with CAPI permission
   → `META_CAPI_TOKEN` (or reuse the master token).
3. `META_CAPI_PIXEL_ID` secret = this pixel's ID.
4. `capi-lead-event` sends `Lead` / `Qualified` events here, keyed on the lead's phone
   (hashed). Used for CRM-style optimization and audience building.

### 5.2 CTWA Messaging Dataset — "LeadSubmitted" events (the tricky one)
This dataset receives events with `action_source: business_messaging`,
`messaging_channel: whatsapp`, and `user_data: {whatsapp_business_account_id, ctwa_clid}`.
The `ctwa_clid` is captured by `whatsapp-webhook` from the ad referral on the lead's
first message.

Setup checklist — **every step is required or events are silently dropped**:
1. In Events Manager, the WABA gets/creates a messaging dataset (ours: `873957555788541`).
   Note its ID → `META_MESSAGING_DATASET_ID`.
2. ⚠️ **LINK THE APP TO THE DATASET.** Events Manager → dataset → Settings →
   connect the Meta App (flow appears as "Create from a pixel ID" / connected apps).
   **This was THE root cause of our "events accepted but never recorded" saga.**
   `events_received: 1` in the API response only means the JSON parsed — NOT that the
   event was recorded.
3. Give the **ad account** access to the dataset (dataset → Ad accounts / assets).
4. Test: fire an event with a `test_event_code` from Events Manager's Test Events tab
   and confirm it appears there.
5. Reporting gotchas (verified in production):
   - Graph API reporting (`last_fired_time`, stats endpoints) **lags the Events Manager
     UI by hours** for messaging events. Trust the UI.
   - Conversion-optimization goal on a LIVE ad set is locked/greyed out. To optimize for
     LeadSubmitted you must create a **NEW campaign/ad set** — and only after the dataset
     has ~1–2 weeks of event volume.

---

## 6. Phase 5 — The AI Qualifier ("Saloni")

### 6.1 Where Anthropic goes
Exactly one place: the `ANTHROPIC_API_KEY` secret in Supabase Edge Functions (§3.5).
Not Vercel, not the frontend, not git. Model defaults to `claude-haiku-4-5`; override
with the `QUALIFY_MODEL` secret if needed.

### 6.2 How it works (architecture you should not change)
- `ai-qualify` is **stateless**: callers send conversation history, it returns
  `{reply, done, outcome}` with outcome ∈ `qualified | buy_leads | affiliate | null`.
  Outcomes are parsed from hidden tokens `[[QUALIFIED]] [[LEADS]] [[AFFILIATE]]` the
  model appends.
- The **webhook** runs it inline for first-time chats: atomic activation claim
  (`ai_status null → active` conditional update — prevents double greetings under
  concurrent messages), typing indicator while thinking, `EdgeRuntime.waitUntil` so the
  isolate can't be reclaimed mid-reply.
- The **catch-up cron** re-runs it for dropped replies and sends at most two fixed
  nudges (20 min "are you still there?", ~20 h final check before the 24 h window closes).
- A human replying from the Inbox turns the AI off for that chat (`send-message` flips
  `ai_status` to `off`).
- On done: qualified → CAPI Qualified event + assign to owner; buy_leads → tag only,
  **NO Meta event** (would teach Meta to find lead-buyers); affiliate → tag only, no
  assignment, no event.

### 6.3 What you MUST rewrite per company — the `systemPrompt`
Open `supabase/functions/ai-qualify/index.ts` → `systemPrompt(name)`. Rewrite these
blocks for the new company (this is the single most important customization):

1. **Persona**: name ("Saloni"), role, company name, language/tone.
2. **"WHAT <COMPANY> ACTUALLY DOES / WHAT WE DO NOT DO"** — ground truth about the
   business. ⚠️ Non-negotiable: without this block the model WILL hallucinate services
   (ours told a live lead we sell pre-qualified leads — we don't). Write both what they
   do AND explicitly what they don't.
3. **Qualifying questions** — the new company's actual criteria (ours: runs ads?,
   industry, monthly ad spend, website).
4. **Decline / special-case rules** — who to politely turn away (ours: affiliate/MLM
   companies like iDP, Leadsguru, Bizgurukul) and who to short-circuit to a human
   (ours: people wanting to buy leads).
5. **Hand-off wording** — always "an expert from our team", never "someone" (client
   rule; adapt per client).
6. Keep the built-in conversation rules — they encode months of fixes: acknowledge
   genuinely but briefly (no billboard/tagline talk), never re-ask an answered question,
   a bare "yes" right after your question means yes, a reply to a check-in nudge is not
   a qualifying answer, callback requests ("call me tomorrow") = acknowledge + hand off
   as qualified.

If the new company needs different **outcomes** (e.g. no "buy_leads" concept), change the
token list in `ai-qualify` AND the outcome handling in `whatsapp-webhook` +
`ai-qualify-catchup` (both mirror it) AND the SQL tag functions.

### 6.4 Test before enabling
Curl the function with a fake history (use the service-role key as bearer) and check
tone, grounding, and outcome tokens. Only then set `ai_qualify_enabled=true`.

---

## 7. Phase 6 — n8n lead-form ingest (optional)

Only needed if the client also runs Meta **Lead Forms** (not just CTWA).
Follow `n8n/SETUP-CHECKLIST.md`: import `n8n/dfy-whatsapp-meta-leads-workflow.json`,
set a fresh `INGEST_SECRET` (Supabase secret + workflow header must match — generate a
NEW value per client, never reuse), paste the client's page access token into the n8n
node, and map the form's field names.

---

## 8. Go-live verification checklist

Run through ALL of these before handing over:

- [ ] Send "hi" from a fresh personal number → webhook stores it, AI greets within
      seconds, typing indicator shows.
- [ ] Answer the questions → AI progresses without re-asking; on completion the chat is
      assigned to the owner and (if from an ad) Qualified fires on the CRM pixel.
- [ ] Send a voice note → it appears playable in the Inbox (fetch-inbound-media working).
- [ ] Reply as a human from the Inbox → AI goes silent for that chat permanently.
- [ ] Go quiet mid-qualification → 20-min nudge arrives exactly once.
- [ ] Turn the AI off in WhatsApp Settings → new chats get no AI reply (kill switch).
- [ ] `select * from cron.job_run_details order by start_time desc limit 10;` → all succeeded.
- [ ] CTWA test event appears in Events Manager **Test Events tab** (not just
      `events_received:1`).
- [ ] Supabase Advisors → Security → zero criticals; anon curl of
      `ai_qualify_candidates` RPC returns 401/permission denied.
- [ ] Login works on the Vercel URL; realtime updates flow into the Inbox.
- [ ] Templates screen syncs the WABA's approved templates.

---

## 9. Per-company change matrix (quick reference)

| # | What changes | Where |
|---|---|---|
| 1 | Meta App ID/Secret, WABA ID, Phone Number ID, permanent token | Meta setup → Supabase secrets |
| 2 | Verify token, cron secret, ingest secret (fresh random values!) | Supabase secrets + webhook config + cron SQL + n8n |
| 3 | Supabase project ref | Vercel env, cron SQL URLs, webhook callback URL, `supabase link` |
| 4 | Anthropic API key (new key per client for billing separation) | Supabase secret `ANTHROPIC_API_KEY` |
| 5 | AI persona + company grounding + questions + decline rules | `ai-qualify/index.ts` systemPrompt |
| 6 | Hard-coded publishable key in `ai-qualify` ALLOWED set | `ai-qualify/index.ts` |
| 7 | CRM pixel ID + CTWA dataset ID | Supabase secrets `META_CAPI_PIXEL_ID`, `META_MESSAGING_DATASET_ID` |
| 8 | business_name, business_number, pipeline stages | `app_settings` row |
| 9 | Auth users + profiles (owner first — hand-off assigns to oldest profile) | Supabase Auth + `profiles` |
| 10 | Notify emails / Resend key / VAPID keys | Supabase secrets + `app_settings` |
| 11 | Branding (logo, name in UI) | `src/` frontend |
| 12 | n8n workflow (page token, form field names) | n8n |

Everything else — schema, edge-function code, cron cadence, frontend — is copied verbatim.

---

## 10. Hard-won gotchas (things that WILL bite you if forgotten)

1. **`EdgeRuntime.waitUntil` is mandatory** in whatsapp-webhook. A floating promise gets
   the isolate reclaimed mid-reply → leads silently never get answered.
2. **Retry Claude calls.** A single transient 502 once delayed a lead's reply ~3 min.
   `ai-qualify` retries 408/429/5xx with backoff — keep that.
3. **Atomic claims everywhere.** The `null→active` conditional update prevents double
   greetings; the SQL claim functions prevent the cron double-sending. Never replace
   with read-then-write.
4. **`REVOKE FROM PUBLIC`**, not just anon/authenticated (§3.2) — otherwise SECURITY
   DEFINER functions leak lead phone numbers to anyone with the anon key.
5. **CTWA: link the app to the dataset** (§5.2). `events_received:1` ≠ recorded.
6. **Graph reporting lags Events Manager UI by hours** for messaging events — check the
   UI before declaring events broken.
7. **Optimization goal is locked on live ad sets** — conversion-optimizing on
   LeadSubmitted needs a brand-new ad set.
8. **Text-less messages must appear in the AI history** (as `[the lead sent a
   voice/image message]`) or the history ends on the assistant's turn and the model
   returns nothing — this once looped the catch-up for 3 hours.
9. **The 24 h WhatsApp window** rules everything: nudge #2 fires ~20 h in for a reason;
   after 24 h only paid template messages can reach the lead.
10. **Never hand-transcribe keys/tokens** — a single corrupted character (we produced a
    Cyrillic Ф once) breaks auth in ways that look like logic bugs. Copy-paste only.
11. **Media fetch is 2 hops** (media id → CDN url → bytes) and BOTH need the token.
12. **Keep `ai_qualify_enabled=false` until the prompt is client-ready** — the AI talks
    to real paying leads the moment it's on.
13. **Webhook must answer Meta fast** (< 10 s or Meta retries/disables). All heavy work
    happens after the 200 via waitUntil.

---

## 11. Secrets inventory (print this when onboarding a client)

Collect/generate, in order: Meta App ID, Meta App Secret, WABA ID, Phone Number ID,
permanent system-user token, verify token (invent), CRM pixel ID, CTWA dataset ID,
Anthropic API key, cron secret (invent), ingest secret (invent), Resend key (optional),
VAPID keypair (generate). Store them ONLY in: Supabase Edge Function Secrets (all),
Meta webhook config (verify token), n8n (page token + ingest secret), Vercel
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — the only two, both public anyway).

---

*Maintained alongside the code. If you change a function's auth model, an outcome, a
secret name, or a cron job — update this file in the same commit.*

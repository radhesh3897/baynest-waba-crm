# DFY WhatsApp — Meta Leads → n8n → Supabase setup

This workflow catches new Meta Lead Ad submissions from your Facebook page and
creates them as contacts/records in the WhatsApp tool (Supabase).

Flow: Meta form → n8n webhook → fetch lead from Meta → create contact via `ingest-lead`.

---

## Before you import — set the Supabase secret (one time)

The workflow authenticates to Supabase with a shared secret. Set it once:

1. Supabase dashboard → Project Settings → **Edge Functions** → **Secrets** (the same
   page where WHATSAPP_TOKEN etc. live):
   https://supabase.com/dashboard/project/rkmngnkgesteohigvsxe/settings/functions
2. Add a secret:
   - **Name:** `INGEST_SECRET`
   - **Value:** `IA04S1eWguiRmNcbKOvq7XoFBGzCxk5p3ashDdV6`
3. Save.

(This exact value is already baked into the workflow's `x-ingest-secret` header, so
they will match.)

---

## Import + configure the workflow

1. n8n → Workflows → Import from File → `dfy-whatsapp-meta-leads-workflow.json`
2. Open the **Fetch Lead from Meta** node → replace `<<PASTE_PAGE_ACCESS_TOKEN_HERE>>`
   with your **long-lived Page Access Token** (do NOT paste it in chat — only in n8n).
   - Generate a never-expiring token via a **System User** (preferred) or a 60-day
     long-lived token. See the token section below.
3. Open the **Parse Lead Fields** node → make sure the field keys on the right match
   your Meta form's **internal field names** (case-sensitive). Defaults included:
   `first_name, last_name, phone_number, email, company_name, city`.
4. Click **Publish**.

---

## Connect the page to Meta (one time)

1. **Subscribe the page to leadgen** — run once (temporary HTTP node or Graph Explorer),
   using the **Page Access Token**:
   ```
   POST https://graph.facebook.com/v21.0/<PAGE_ID>/subscribed_apps
   subscribed_fields = leadgen
   access_token = <PAGE_ACCESS_TOKEN>
   ```
   Expect `{"success": true}`.
2. **Enable "Access Leads"** for the n8n app on your page:
   https://facebook.com/leads/access/ → select page → toggle ON.
3. **Register the webhook** in your Meta app → Webhooks (Page):
   - Callback URL: `https://<your-n8n-host>/webhook/dfy-whatsapp-meta-leads`
   - Verify token: any string (e.g. `n8n2026`)
   - Subscribe to the **leadgen** field.
   - The workflow must be **Published** before clicking Verify and Save.

---

## Test

1. https://developers.facebook.com/tools/lead-ads-testing → select page + form →
   Delete lead → Create lead → Track Status → should be green.
2. n8n Executions → all nodes green.
3. Supabase → Table Editor → `contacts` → new row with the lead's details,
   `source = Meta Lead Ads`.

---

## What I still need from you to finalise

- **Facebook Page ID** (Graph Explorer: `GET /me?fields=id,name` with the page token)
- Confirm the **Meta form's internal field names** so the Parse node maps correctly
- Your **n8n host URL** (the skill's default is `https://n8n.srv1296547.hstgr.cloud`)

## Long-lived token (quick reference)
- **System User (never expires, preferred):** business.facebook.com/settings → System Users →
  add `n8n Automation` (Admin) → Add Assets → your page (Full Control) → Generate token for
  the n8n Ads Management app with `leads_retrieval, pages_read_engagement, pages_manage_metadata`.
- **60-day token:** exchange a fresh short-lived page token via
  `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<SHORT_TOKEN>`.

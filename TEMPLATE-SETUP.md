# WhatsApp CRM — Template Setup (per client)

This is the **white-label base**. Every client gets an identical copy of this code;
you only change a short list of values. This file is the quickstart. For the full
from-scratch build (Meta app, tokens, deploy commands, Meta pixels, gotchas), see
[`docs/REPLICATION-BIBLE.md`](docs/REPLICATION-BIBLE.md).

> **Golden rule:** the base is shared. Never fork the logic per client — only edit
> the config points below. If a change should apply to *every* client, make it in
> the shared code; if it's client-specific, it belongs in one of these config spots.

---

## The only things you change per client

### 1. Frontend branding — `src/config/client.js`
One file. Sets the company name, logo, tagline, and colours.
```js
name:      "Baynest Realty",
shortName: "Baynest",
tagline:   "Team access",
logo:      "/assets/logo.png",
colors: { primary: "#…", primaryDark: "#…", primaryLight: "#…", accent: "#…" },
```
- Drop the client's logo at `public/assets/logo.png` (keep that filename).
- The four colours re-theme the whole UI (they drive `--brand-*` CSS variables).
- `shortName` also sets the browser tab title.

### 2. AI assistant — the `CLIENT` block in `supabase/functions/ai-qualify/index.ts`
Everything the assistant says comes from this block at the very top of the file
(persona, company facts, what the company does / does NOT do, the qualifying
questions, hand-off wording). The conversation rules below it are shared — do not
touch them. For a plain qualifier that just qualifies every real lead (e.g. a
realty client), set `earlyStops: []`.

> ⚠️ The `doesFacts` / `doesNotFacts` lists are what stop the AI inventing
> services. Fill them with the client's real ground truth before going live.

### 3. Supabase project (the client's own)
- Create the project, enable `pg_cron` + `pg_net`, apply the migrations in
  `supabase/migrations/` (17 files — the full schema incl. AI qualifier + CTWA).
- Create the `wa-media` storage bucket (public read).
- Set the edge-function **secrets** (full table in the bible §3.5): `WHATSAPP_TOKEN`,
  `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`,
  `META_APP_ID`, `META_APP_SECRET`, `META_API_VERSION`, `META_CAPI_PIXEL_ID`,
  `META_MESSAGING_DATASET_ID`, **`ANTHROPIC_API_KEY`**, `CRON_SECRET`,
  `INGEST_SECRET`, `RESEND_API_KEY`, VAPID keys.
- Deploy the edge functions (JWT flags per function — see bible §3.6).
- Schedule the 6 cron jobs (bible §3.7).
- Seed the `app_settings` row (`business_name`, `business_number`,
  `ai_qualify_enabled=false` until the AI prompt is client-ready).
- Create the Auth login user + a matching `profiles` row (owner first — the AI
  hand-off assigns chats to the oldest profile).

### 4. Anthropic
The client's `ANTHROPIC_API_KEY` goes in **one** place: the Supabase secret above.
Never in the frontend, never in git.

### 5. Meta / Facebook
The client's own: Business Manager, WhatsApp number + WABA, Facebook Page, Ad
Account, permanent system-user token, CRM pixel, CTWA dataset. Point the webhook
at `https://<their-ref>.supabase.co/functions/v1/whatsapp-webhook`. (Bible §2, §5.)

### 6. Forms (only if they run Meta Lead Forms)
Import `n8n/dfy-whatsapp-meta-leads-workflow.json`, set a **fresh** `INGEST_SECRET`,
paste their page token, map their form field names. (Bible §7.)

### 7. Frontend env — `.env`
```
VITE_SUPABASE_URL=https://<their-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<their anon/publishable key>
```
Then deploy to their Vercel.

---

## Local preview
```bash
npm install
npm run dev
```
Runs on http://localhost:5177. With placeholder `.env` values the login screen
renders (for branding checks); real login needs the client's Supabase project.

---

## Residual DFY strings to sweep per client (cosmetic)
The core chrome (login, sidebar, tab title) is already config-driven. A few
lower-traffic spots still say "Done For You" / "DFY" as the shipped default —
search and replace when rebranding:
- `src/screens/MetaDashboard.jsx` (dashboard fallback label + a secret-name hint)
- `src/screens/Stub.jsx` (help text)
- `src/screens/Templates.jsx` (template preview mock label)
- `src/dataAdapter.js` (demo/mock seed data — only shown in demo mode; optional)

---

## What is shared and must NOT be edited per client
The edge-function logic, the AI conversation rules (anti-re-ask, callback handling,
nudges, retry), the database schema, the cron cadence, the frontend components.
These are the base. Changing them changes the tool for everyone.

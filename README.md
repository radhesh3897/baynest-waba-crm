# WhatsApp CRM — White-Label Template

A reusable base for the WhatsApp CRM + AI lead-qualifier tool. One codebase,
identical for every client; only a short list of config values changes per client.

**Stack:** Vite + React 19 + Tailwind v4 frontend · Supabase (Postgres + Edge
Functions + pg_cron + Storage + Auth) backend · Meta WhatsApp Cloud API ·
Anthropic Claude (the AI qualifier).

## Start here
- **[TEMPLATE-SETUP.md](TEMPLATE-SETUP.md)** — the per-client quickstart: the exact
  files and values you change to spin up a new client.
- **[docs/REPLICATION-BIBLE.md](docs/REPLICATION-BIBLE.md)** — the full from-scratch
  build manual: Meta app, tokens, Supabase deploy, cron, Meta pixels, go-live
  checklist, and every hard-won gotcha.

## The two edit points
1. `src/config/client.js` — branding (name, logo, colours, tagline).
2. The `CLIENT` block at the top of `supabase/functions/ai-qualify/index.ts` — the
   AI assistant's persona, company facts, and qualifying questions.

Everything else is the shared base. See TEMPLATE-SETUP.md for the full checklist.

## Local dev
```bash
npm install
npm run dev   # http://localhost:5177
```

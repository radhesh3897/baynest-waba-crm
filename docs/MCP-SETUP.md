# Baynest WABA MCP

The remote MCP endpoint is
`https://oeygcusojsznwuodbckz.supabase.co/functions/v1/waba-mcp`.

It uses the existing Baynest Supabase project and the existing WhatsApp sender.
Claude and ChatGPT authenticate as a Baynest CRM user. The server checks the
user's `mcp_access` record on every request. Only the two CRM accounts present
when this migration ran were provisioned. New sign-ups require an administrator
to grant access explicitly.

The owner selected **read-only client access on 20 November 2026**. The
`baynest_mcp_read_only` migration sets `can_write` and `can_send` to false for
the provisioned accounts. Claude and ChatGPT receive the six viewing tools
listed below. Permissions are checked on every request.

## Tools

| Tool | Purpose |
| --- | --- |
| `search` | Find leads by name, phone, email, CRM ID, or original Meta lead ID. Filter stage, source, and creation dates. |
| `fetch` | Read a lead, enquiry answers, recent notes, and stage history. |
| `get_pipeline` | Count leads in each configured CRM stage. |
| `get_conversation` | Read paginated WhatsApp history and the current reply window. |
| `list_templates` | Read approved template bodies, variables, languages, and buttons. |
| `get_operation` | Read the receipt for a change or message send. |

`update_lead` and `add_note` require `can_write`. `send_whatsapp` requires
`can_send`. The tool list hides unavailable actions. Each mutation requires a
UUID `request_id`. Repeating that UUID with the same arguments returns the
stored receipt. Reusing it with different arguments fails. `pending` and
`unknown` deliveries must be checked in the CRM before any new send attempt.
The database limits new mutations to 20 per minute per agent.

WhatsApp conversation and template data comes from the existing CRM. This
connection uses the signed-in CRM user's account and the existing database
access rules.

## Enable remote sign-in

Supabase Auth OAuth server settings require access to the project dashboard.
The connected Supabase development tools expose database and Edge Function
operations, but do not expose Auth configuration updates.

1. Open the [Baynest OAuth Server settings](https://supabase.com/dashboard/project/oeygcusojsznwuodbckz/auth/oauth-server).
2. Enable the OAuth 2.1 server.
3. Set its authorization path to `/oauth/consent`.
4. Confirm that Authentication → URL Configuration has Site URL
   `https://waba.baynestrealty.com`. The resulting consent URL must be
   `https://waba.baynestrealty.com/oauth/consent`.
5. Enable dynamic client registration so Claude and ChatGPT can register their
   own clients. Registration alone grants no CRM access. The user must sign in
   and approve the consent screen.
6. Check that
   `https://oeygcusojsznwuodbckz.supabase.co/.well-known/oauth-authorization-server/auth/v1`
   returns the OAuth metadata and registration endpoint.

The consent screen reuses the CRM login. It shows the actual client's name,
the signed-in account, the data it can read, and the allowed write/send actions.
It has explicit Allow connection and Cancel buttons. Existing sessions remain
valid during setup.

## Connect Claude

In Claude Settings → Connectors, add a custom connector named **Baynest WABA**.
Paste the MCP endpoint above, connect, sign in with the CRM account, and approve
the Baynest consent screen. Use the remote connector in your conversations.

## Connect ChatGPT

Enable developer mode in ChatGPT's Apps settings when available for your
account or workspace. Create a custom app named **Baynest WABA**, use the MCP
endpoint above, and choose OAuth authentication. Complete the CRM sign-in and
consent flow. Refresh the app after changing MCP tool definitions.

Example first prompts are "Show the last five Baynest leads", "Count our
leads by stage", and "Show this lead's enquiry answers and WhatsApp history."

## Development and verification

```sh
cd supabase/functions/waba-mcp
deno task check
deno task test
```

The test suite uses isolated fixtures. It checks authentication, permissions,
retry handling, uncertain delivery, WhatsApp reply windows, template routing,
optimistic concurrency, note attribution, and protection of original Meta IDs.
It sends no real customer messages.

Public deployment checks can verify `/health`, the protected resource metadata
path from `WWW-Authenticate`, and a 401 response to unauthenticated MCP calls.
Complete an actual OAuth connection in Claude or ChatGPT before treating the
sign-in flow as verified end to end.

Deploy the function with its `deno.json` and lockfile. The gateway JWT check is
disabled only for this function because MCP discovery is public. Every CRM
request still validates the bearer token through Supabase Auth and checks
`mcp_access`. Supabase keys remain in server-side secrets and the existing
frontend publishable/anon environment configuration.

To revoke MCP access immediately, set the user's `mcp_access.enabled` to false
using an administrator account. To restrict actions, update `can_write` or
`can_send`. These fields are read on every MCP request and checked again when
reserving a mutation. Client users cannot edit their own permissions.

## Sources

- [Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Supabase OAuth setup and consent UI](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [MCP server deployment on Supabase](https://supabase.com/docs/guides/ai-tools/byo-mcp)
- [OpenAI MCP authentication](https://developers.openai.com/plugins/build/auth)
- [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

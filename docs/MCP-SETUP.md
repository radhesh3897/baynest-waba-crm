# Baynest WABA MCP

The remote MCP endpoint is
`https://oeygcusojsznwuodbckz.supabase.co/functions/v1/waba-mcp`.

It uses the existing Baynest Supabase project and the existing WhatsApp sender.
Claude and ChatGPT authenticate as a Baynest CRM user. The server checks the
user's `mcp_access` record on every request. Only the two CRM accounts present
when this migration ran were provisioned. New sign-ups require an administrator
to grant access explicitly.

The client's permissions allow CRM reading, WhatsApp template creation and
submission for Meta review, and sending approved templates to CRM contacts.
`can_write` controls lead editing. `can_manage_templates` controls template
submission, and `can_send` controls the template sender. Permissions are
checked on every request and again when reserving a mutation.

## Tools

| Tool | Purpose |
| --- | --- |
| `search` | Find leads by name, phone, email, CRM ID, or original Meta lead ID. Filter stage, source, and creation dates. |
| `fetch` | Read a lead, enquiry answers, recent notes, and stage history. |
| `get_pipeline` | Count leads in each configured CRM stage. |
| `get_conversation` | Read paginated WhatsApp history and the current reply window. |
| `list_templates` | Read approved template bodies, variables, languages, and buttons. |
| `get_operation` | Read the receipt for a change or message send. |
| `get_template_status` | Read an exact template and language's live Meta approval status and components. |
| `create_template` | Submit approved copy, category, and components to Meta for review. |
| `send_template_message` | Check Meta approval live and send a template to one CRM contact. |

Each mutation requires a
UUID `request_id`. Repeating that UUID with the same arguments returns the
stored receipt. Reusing it with different arguments fails. `pending` and
`unknown` deliveries must be checked in the CRM before any new send attempt.
The database limits new mutations to 20 per minute per agent.

The client workflow is to approve the template copy and category, call
`create_template`, check `get_template_status`, and call
`send_template_message` once Meta reports `APPROVED`. Meta controls approval.
The send must specify the recipient, template language, and any placeholder
parameters. Pending, rejected, paused, disabled, or missing templates fail
the live approval check. A first WhatsApp conversation is created for an
existing CRM contact when required. Sent messages use the existing CRM sender
and record the signed-in sender and Meta message ID.

For rollout, apply `baynest_mcp_templates`, deploy MCP version 1.1.0, then grant
`can_manage_templates=true` and `can_send=true` to the selected enabled
`mcp_access` users. Set `can_write` according to the user's lead-editing needs.
Refresh the connector in Claude or ChatGPT to reload the updated tool list.

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

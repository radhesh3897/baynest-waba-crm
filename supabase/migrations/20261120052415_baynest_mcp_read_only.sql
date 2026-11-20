-- The owner chose read-only access for the client-facing Claude/ChatGPT MCP.
-- Checks run on every request and again inside the mutation reservation RPC.
update public.mcp_access
set can_write = false, can_send = false
where can_write or can_send;

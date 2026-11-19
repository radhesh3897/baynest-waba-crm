import { handleRequest } from "./server.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const config = {
  url,
  anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  endpoint: `${url}/functions/v1/waba-mcp`,
};

Deno.serve(async (req) => {
  try {
    return await handleRequest(req, config);
  } catch {
    return Response.json({ error: "Baynest MCP is temporarily unavailable." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
});

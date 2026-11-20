import {
  type Config,
  handleRequest,
  searchPattern,
  stableJson,
} from "./server.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const contactId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const updatedAt = "2026-11-19T05:00:00.000Z";
const config: Config = {
  url: "https://crm.example.invalid",
  anonKey: "test-anon",
  serviceKey: "test-service",
  endpoint: "https://crm.example.invalid/functions/v1/waba-mcp",
  meta: { token: "test-meta", wabaId: "test-waba", apiVersion: "v23.0" },
};

function assert(
  condition: unknown,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function fixture(
  options: {
    enabled?: boolean;
    write?: boolean;
    send?: boolean;
    expired?: boolean;
    sendError?: boolean;
    concurrentEdit?: boolean;
    manageTemplates?: boolean;
    templateStatus?: string;
    templateExists?: boolean;
    missingConversation?: boolean;
    submissionError?: boolean;
  } = {},
) {
  const operations = new Map<string, any>();
  const calls: { path: string; method: string; body: any }[] = [];
  let deliveries = 0;
  let submissions = 0;
  let conversationCreated = false;
  const lead = {
    id: contactId,
    wa_id: "+919000000001",
    profile_name: "MCP fixture",
    updated_at: updatedAt,
    attributes: { meta_lead_id: "real-fixture-meta-id" },
  };
  const respond = (body: unknown, status = 200, headers = {}) =>
    Response.json(body, { status, headers });
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    const body = request.method === "GET" || request.method === "HEAD"
      ? null
      : await request.json();
    calls.push({ path, method: request.method, body });
    if (path === "/auth/v1/user") {
      if (request.headers.get("authorization") !== "Bearer test-user") {
        return respond({ message: "Invalid JWT" }, 401);
      }
      return respond({
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
      });
    }
    if (path === "/rest/v1/mcp_access") {
      return respond({
        enabled: options.enabled ?? true,
        can_write: options.write ?? true,
        can_send: options.send ?? true,
        can_manage_templates: options.manageTemplates ?? false,
      });
    }
    if (path === "/rest/v1/app_settings") {
      return respond({
        pipeline_sections: { E: ["New", "Qualified"], S: ["Contacted"] },
      });
    }
    if (path === "/rest/v1/contacts") {
      if (request.method === "PATCH") {
        if (options.concurrentEdit) return respond(null);
        return respond({
          ...lead,
          ...body,
          updated_at: "2026-11-19T05:01:00.000Z",
        });
      }
      return respond(lead);
    }
    if (path === "/rest/v1/conversations") {
      if (request.method === "POST") {
        conversationCreated = true;
        return respond(null);
      }
      if (options.missingConversation && !conversationCreated) {
        return respond(null);
      }
      return respond({
        id: contactId,
        window_expires_at: options.expired
          ? "2000-01-01T00:00:00Z"
          : "2099-01-01T00:00:00Z",
      });
    }
    if (path === "/rest/v1/templates") {
      return respond({
        name: "test_template",
        language: "en",
        status: "APPROVED",
      });
    }
    if (path === "/rest/v1/contact_notes") return respond(body);
    if (path === "/v23.0/test-waba/message_templates") {
      assert(request.headers.get("Authorization") === "Bearer test-meta");
      return respond({
        data: options.templateExists === false ? [] : [{
          id: "meta-template-id",
          name: url.searchParams.get("name"),
          language: JSON.parse(url.searchParams.get("language")!)[0],
          status: options.templateStatus ?? "APPROVED",
          category: "UTILITY",
          components: [{ type: "BODY", text: "Hello {{1}}" }],
        }],
      });
    }
    if (path === "/functions/v1/create-template") {
      assert(request.headers.get("Authorization") === "Bearer test-service");
      submissions++;
      if (options.submissionError) {
        return respond({ error: "Uncertain template submission" }, 500);
      }
      return respond({
        ok: true,
        id: "meta-created-template-id",
        status: "PENDING",
        category: body.category,
      });
    }
    if (path === "/rest/v1/rpc/mcp_reserve_operation") {
      const prior = operations.get(body.p_request_id);
      if (prior) {
        if (prior.request_hash !== body.p_hash) {
          return respond({
            message: "request_id was already used for different arguments",
          }, 400);
        }
        return respond({ claimed: false, operation: prior });
      }
      const operation = {
        id: requestId,
        request_hash: body.p_hash,
        request_id: body.p_request_id,
        status: "pending",
        result: null,
      };
      operations.set(body.p_request_id, operation);
      return respond({ claimed: true, operation });
    }
    if (path === "/rest/v1/mcp_operations") {
      if (request.method === "PATCH") {
        Object.assign(operations.get(requestId), body);
        return respond({ id: requestId });
      }
      assert(
        url.searchParams.get("user_id") === `eq.${userId}`,
        "Operation lookup must be scoped to the signed-in user",
      );
      return respond(operations.get(requestId) ?? null);
    }
    if (path === "/functions/v1/send-message") {
      deliveries++;
      if (options.sendError) {
        return respond({
          error: "Message may have been sent before a database error",
        }, 500);
      }
      return respond({
        ok: true,
        message: { id: requestId, wa_message_id: "wamid.confirmed-fixture" },
      });
    }
    throw new Error(`Unexpected external request ${request.method} ${path}`);
  };
  return {
    fetcher,
    calls,
    operations,
    deliveries: () => deliveries,
    submissions: () => submissions,
  };
}

async function withFixture(
  options: Parameters<typeof fixture>[0],
  run: (f: ReturnType<typeof fixture>) => Promise<void>,
) {
  const original = globalThis.fetch;
  const f = fixture(options);
  globalThis.fetch = f.fetcher;
  try {
    await run(f);
  } finally {
    globalThis.fetch = original;
  }
}

async function rpc(method: string, params: unknown, token = "test-user") {
  return await handleRequest(
    new Request(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    config,
  );
}

async function decode(response: Response) {
  const text = await response.text();
  if (response.headers.get("Content-Type")?.includes("text/event-stream")) {
    return JSON.parse(
      text.split("\n").filter((line) => line.startsWith("data: ")).at(-1)!
        .slice(6),
    );
  }
  return JSON.parse(text);
}

async function call(name: string, args: unknown) {
  const message = await decode(
    await rpc("tools/call", { name, arguments: args }),
  );
  let value;
  try {
    value = JSON.parse(message.result?.content?.[0]?.text || "{}");
  } catch {
    value = { error: message.result?.content?.[0]?.text };
  }
  return {
    ...message.result,
    value,
  };
}

Deno.test("unauthenticated MCP requests get OAuth discovery, not CRM data", async () => {
  await withFixture({}, async (f) => {
    const response = await handleRequest(
      new Request(config.endpoint, { method: "POST", body: "{}" }),
      config,
    );
    assert(response.status === 401);
    assert(
      response.headers.get("WWW-Authenticate")?.includes(
        "/.well-known/oauth-protected-resource",
      ),
    );
    assert(f.calls.length === 0);
    const metadata = await handleRequest(
      new Request(`${config.endpoint}/.well-known/oauth-protected-resource`),
      config,
    );
    assert((await metadata.json()).resource === config.endpoint);
  });
});

Deno.test("invalid tokens and unprovisioned users cannot reach CRM tools", async () => {
  await withFixture({}, async (f) => {
    assert((await rpc("tools/list", {}, "forged")).status === 401);
    assert(f.calls.length === 1);
  });
  await withFixture({ enabled: false }, async (f) => {
    assert((await rpc("tools/list", {})).status === 403);
    assert(f.calls.length === 2);
  });
});

Deno.test("tool discovery hides updates and sends when permissions are disabled", async () => {
  await withFixture({ write: false, send: false }, async () => {
    const body = await decode(await rpc("tools/list", {}));
    const names = body.result.tools.map((tool: { name: string }) => tool.name);
    assert(names.includes("search") && names.includes("get_operation"));
    assert(!names.includes("update_lead") && !names.includes("send_whatsapp"));
  });
});

Deno.test("WhatsApp sends persist a receipt and a repeated request sends once", async () => {
  await withFixture({}, async (f) => {
    const args = {
      contact_id: contactId,
      request_id: requestId,
      type: "text",
      text: "Fixture only",
    };
    const first = await call("send_whatsapp", args);
    const second = await call("send_whatsapp", args);
    assert(first.value.status === "completed", JSON.stringify(first));
    assert(second.value.replayed === true);
    assert(f.deliveries() === 1);
    const receipt = await call("get_operation", { request_id: requestId });
    assert(
      receipt.value.operation.result.message.wa_message_id ===
        "wamid.confirmed-fixture",
    );
  });
});

Deno.test("uncertain delivery is recorded and cannot send again on retry", async () => {
  await withFixture({ sendError: true }, async (f) => {
    const args = {
      contact_id: contactId,
      request_id: requestId,
      type: "text",
      text: "Fixture only",
    };
    const first = await call("send_whatsapp", args);
    const second = await call("send_whatsapp", args);
    assert(first.value.status === "unknown");
    assert(second.value.status === "unknown" && second.isError);
    assert(f.deliveries() === 1);
  });
});

Deno.test("closed reply windows prevent text delivery", async () => {
  await withFixture({ expired: true }, async (f) => {
    const reply = await call("send_whatsapp", {
      contact_id: contactId,
      request_id: requestId,
      type: "text",
      text: "Fixture only",
    });
    assert(reply.value.status === "failed");
    assert(f.deliveries() === 0);
  });
});

Deno.test("approved templates use the existing sender and exact language", async () => {
  await withFixture({ expired: true }, async (f) => {
    const reply = await call("send_whatsapp", {
      contact_id: contactId,
      request_id: requestId,
      type: "template",
      template_name: "test_template",
      language: "en",
    });
    assert(reply.value.status === "completed", JSON.stringify(reply));
    assert(
      f.calls.find((c) => c.path === "/functions/v1/send-message")?.body
        .template.language === "en",
    );
  });
});

Deno.test("concurrent CRM edits prevent an update, and notes use the actual body column", async () => {
  await withFixture({ concurrentEdit: true }, async () => {
    const reply = await call("update_lead", {
      contact_id: contactId,
      request_id: requestId,
      expected_updated_at: updatedAt,
      changes: { lead_status: "Qualified" },
    });
    assert(reply.value.status === "failed");
  });
  await withFixture({}, async (f) => {
    const reply = await call("add_note", {
      contact_id: contactId,
      request_id: requestId,
      note: "Call completed",
    });
    assert(reply.value.status === "completed", JSON.stringify(reply));
    const note = f.calls.find((c) => c.path === "/rest/v1/contact_notes")?.body;
    assert(note.body === "Call completed" && note.created_by === userId);
  });
});

Deno.test("request identity covers the full payload and protects Meta lead IDs", async () => {
  assert(
    stableJson({ b: 2, a: { z: 3, x: 4 } }) ===
      stableJson({ a: { x: 4, z: 3 }, b: 2 }),
  );
  assert(searchPattern('a,b"c') === '"*a,b\\"c*"');
  await withFixture({}, async (f) => {
    const args = {
      contact_id: contactId,
      request_id: requestId,
      note: "First note",
    };
    await call("add_note", args);
    const conflict = await call("add_note", { ...args, note: "Changed note" });
    assert(conflict.isError);
    assert(
      f.calls.filter((c) => c.path === "/rest/v1/contact_notes").length === 1,
    );
    const invalid = await call("update_lead", {
      contact_id: contactId,
      request_id: requestId,
      expected_updated_at: updatedAt,
      changes: { attributes: { meta_lead_id: "fake" } },
    });
    assert(invalid.isError);
  });
});

Deno.test("client template tools are available while lead edits stay unavailable", async () => {
  await withFixture(
    { write: false, send: true, manageTemplates: true },
    async () => {
      const response = await decode(await rpc("tools/list", {}));
      const names = response.result.tools.map((t: { name: string }) => t.name);
      assert(
        names.includes("create_template") &&
          names.includes("send_template_message") &&
          names.includes("get_template_status"),
      );
      assert(
        !names.includes("update_lead") && !names.includes("add_note") &&
          !names.includes("send_whatsapp"),
      );
    },
  );
});

Deno.test("template creation submits once and records Meta’s pending review receipt without a contact", async () => {
  await withFixture({
    write: false,
    manageTemplates: true,
    templateExists: false,
  }, async (f) => {
    const args = {
      request_id: requestId,
      name: "new_template",
      language: "en",
      category: "UTILITY",
      components: [{ type: "BODY", text: "Your appointment is confirmed." }],
    };
    const first = await call("create_template", args);
    const again = await call("create_template", args);
    assert(
      first.value.status === "completed" &&
        first.value.result.status === "PENDING",
      JSON.stringify(first),
    );
    assert(first.value.result.template_id === "meta-created-template-id");
    assert(again.value.replayed && f.submissions() === 1);
    assert(
      f.calls.find((c) => c.path === "/rest/v1/rpc/mcp_reserve_operation")?.body
        .p_contact_id === null,
    );
  });
});

Deno.test("existing names and ambiguous creation receipts prevent repeat submissions", async () => {
  await withFixture({ manageTemplates: true }, async (f) => {
    const reply = await call("create_template", {
      request_id: requestId,
      name: "test_template",
      language: "en",
      category: "UTILITY",
      components: [{ type: "BODY", text: "Hello" }],
    });
    assert(reply.value.status === "failed" && f.submissions() === 0);
  });
  await withFixture({
    manageTemplates: true,
    templateExists: false,
    submissionError: true,
  }, async (f) => {
    const args = {
      request_id: requestId,
      name: "new_template",
      language: "en",
      category: "UTILITY",
      components: [{ type: "BODY", text: "Hello" }],
    };
    assert((await call("create_template", args)).value.status === "unknown");
    assert((await call("create_template", args)).value.replayed);
    assert(f.submissions() === 1);
  });
});

Deno.test("pending, rejected, paused and missing Meta templates never send despite an approved CRM cache", async () => {
  for (const status of ["PENDING", "REJECTED", "PAUSED", "DISABLED"]) {
    await withFixture({ write: false, templateStatus: status }, async (f) => {
      const args = {
        contact_id: contactId,
        request_id: requestId,
        template_name: "test_template",
        language: "en",
      };
      const reply = await call("send_template_message", args);
      assert(reply.value.status === "failed", JSON.stringify(reply));
      assert(f.deliveries() === 0);
      const live = await call("get_template_status", {
        name: "test_template",
        language: "en",
      });
      assert(live.value.template.status === status && !live.value.send_allowed);
    });
  }
  await withFixture({ write: false, templateExists: false }, async (f) => {
    const reply = await call("send_template_message", {
      contact_id: contactId,
      request_id: requestId,
      template_name: "missing",
      language: "en",
    });
    assert(reply.value.status === "failed" && f.deliveries() === 0);
  });
});

Deno.test("approved templates create a first conversation and send only once", async () => {
  await withFixture(
    { write: false, missingConversation: true, expired: true },
    async (f) => {
      const args = {
        contact_id: contactId,
        request_id: requestId,
        template_name: "test_template",
        language: "en",
        components: [{
          type: "body",
          parameters: [{ type: "text", text: "Client" }],
        }],
      };
      assert(
        (await call("send_template_message", args)).value.status ===
          "completed",
      );
      assert((await call("send_template_message", args)).value.replayed);
      assert(f.deliveries() === 1);
      const created = f.calls.find((c) =>
        c.path === "/rest/v1/conversations" && c.method === "POST"
      );
      assert(created?.body.contact_id === contactId);
      const send = f.calls.find((c) => c.path === "/functions/v1/send-message");
      assert(
        send?.body.type === "template" &&
          send.body.template.components[0].parameters[0].text === "Client",
      );
    },
  );
});

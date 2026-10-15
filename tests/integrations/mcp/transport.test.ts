import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createHostedClient } from "@/integrations/mcp/hosted-client";
import { startLocalListener } from "@/integrations/mcp/local-listener";
import { PairingState } from "@/integrations/mcp/pairing-state";
import { createSearchMcpServer } from "@/integrations/mcp/tool";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const nonce = "33333333-3333-4333-8333-333333333333";
const session = {
  userId,
  workspaceId,
  email: "owner@example.com",
  expiresAt: Date.now() + 3600_000,
};
const output = {
  workspaceId,
  scope: "all",
  results: [
    {
      id: userId,
      sourceType: "page",
      title: "Roadmap",
      snippet: "Source",
      url: `https://app.tamarind.so/w/${workspaceId}?p=${userId}`,
    },
  ],
};

describe("MCP transport and hosted adapter", () => {
  it("uses the fixed HTTPS route, Bearer header, timeout and redirect refusal", async () => {
    const hosted = createHostedClient("https://app.tamarind.so", (async (url, init) => {
      assert.equal(url, "https://app.tamarind.so/api/agents/search");
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer synthetic-token",
      );
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal);
      assert.deepEqual(JSON.parse(init?.body as string), {
        workspaceId,
        query: "roadmap",
        scope: "all",
      });
      return Response.json(output);
    }) as typeof fetch);
    assert.deepEqual(
      await hosted.search("synthetic-token", { workspaceId, query: "roadmap", scope: "all" }),
      output,
    );
    for (const fake of [
      async () => Response.json({ secret: "do not echo" }),
      async () => new Response("private upstream details", { status: 500 }),
      async () => {
        throw new Error("secret");
      },
    ]) {
      const failing = createHostedClient("https://app.tamarind.so", fake as typeof fetch);
      await assert.rejects(
        failing.search("token", { workspaceId, query: "roadmap", scope: "all" }),
        (error: unknown) =>
          error instanceof Error &&
          !error.message.includes("secret") &&
          !error.message.includes("private"),
      );
    }
  });

  it("discovers exactly one tool and calls it only after pairing", async () => {
    let code = "";
    let searches = 0;
    let status = 200;
    const hosted = createHostedClient("https://app.tamarind.so", (async (url) => {
      if (String(url).endsWith("/session")) return Response.json(session);
      searches++;
      return status === 200 ? Response.json(output) : new Response("private", { status });
    }) as typeof fetch);
    const state = new PairingState(hosted.verify, (value) => {
      code = value;
    });
    const server = createSearchMcpServer(state, hosted);
    const client = new Client({ name: "offline-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();
      assert.deepEqual(
        tools.tools.map((tool) => tool.name),
        ["search_knowledge"],
      );
      assert.equal(tools.tools[0].annotations?.readOnlyHint, true);
      assert.equal(
        (
          await client.callTool({
            name: "search_knowledge",
            arguments: { workspaceId, query: "roadmap" },
          })
        ).isError,
        true,
      );
      assert.equal(searches, 0);
      await state.complete({
        ...state.start(code, nonce),
        workspaceId,
        accessToken: "synthetic-token",
      });
      const result = await client.callTool({
        name: "search_knowledge",
        arguments: { workspaceId, query: "roadmap" },
      });
      assert.equal(result.isError, undefined);
      assert.deepEqual(result.structuredContent, output);
      assert.equal(
        (
          await client.callTool({
            name: "search_knowledge",
            arguments: { workspaceId: nonce, query: "roadmap" },
          })
        ).isError,
        true,
      );
      assert.equal(searches, 1);
      status = 401;
      assert.equal(
        (
          await client.callTool({
            name: "search_knowledge",
            arguments: { workspaceId, query: "roadmap" },
          })
        ).isError,
        true,
      );
      assert.throws(() => state.authorization(workspaceId));
    } finally {
      state.stop();
      await client.close();
      await server.close();
    }
  });

  it("binds pairing to loopback and rejects unauthorized HTTP origins and bodies", async () => {
    let code = "";
    const state = new PairingState(
      async () => session,
      (value) => {
        code = value;
      },
    );
    const listener = await startLocalListener(state, "https://app.tamarind.so");
    const post = (path: string, body: unknown, origin = listener.origin, host?: string) =>
      fetch(`${listener.origin}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          ...(host ? { Host: host } : {}),
        },
        body: JSON.stringify(body),
      });
    try {
      assert.equal(new URL(listener.origin).hostname, "127.0.0.1");
      const page = await fetch(`${listener.origin}/connect`);
      assert.equal(page.status, 200);
      assert.match(page.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
      const html = await page.text();
      assert.equal(html.includes(code), false);
      assert.equal(html.includes("synthetic-token"), false);
      // The serialized popup is executable JavaScript, without bundler helpers.
      const script = html.match(/<script[^>]*>([\s\S]*)<\/script>/)![1];
      assert.doesNotThrow(() => new Function(script));
      assert.equal(
        (await post("/pair/start", { code, nonce }, "https://evil.example")).status,
        403,
      );
      assert.equal(
        (await post("/pair/start", { code, nonce }, listener.origin, "evil.example")).status,
        403,
      );
      assert.equal((await post("/pair/start", { code: "wrong", nonce })).status, 400);
      const started = await post("/pair/start", { code, nonce });
      const challenge = await started.json();
      assert.equal(started.status, 200);
      const completed = await post("/pair/complete", {
        ...challenge,
        workspaceId,
        accessToken: "synthetic-token",
      });
      const connection = await completed.json();
      assert.equal(completed.status, 200);
      assert.equal(
        (
          await post("/session", {
            connectionId: connection.connectionId,
            credential: "x".repeat(43),
            sequence: 1,
            accessToken: "synthetic-token",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await post("/session", {
            connectionId: connection.connectionId,
            credential: connection.credential,
            sequence: 1,
            accessToken: "synthetic-token",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await post("/disconnect", {
            connectionId: connection.connectionId,
            credential: connection.credential,
          })
        ).status,
        200,
      );
      assert.throws(() => state.authorization(workspaceId));
      assert.equal((await post("/pair/start", { code: "x".repeat(20_000), nonce })).status, 400);
      assert.equal((await fetch(`${listener.origin}/tokens`)).status, 404);
    } finally {
      state.stop();
      await listener.close();
    }
  });

  it(
    "launches the actual stdio entrypoint, discovers its tool and shuts down",
    { timeout: 15_000 },
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: ["run", "src/integrations/mcp/server.ts"],
        env: { PATH: process.env.PATH ?? "", TAMARIND_APP_URL: "https://app.tamarind.so" },
        stderr: "pipe",
      });
      let diagnostics = "";
      transport.stderr?.on("data", (chunk) => {
        diagnostics += String(chunk);
      });
      const client = new Client({ name: "stdio-offline-test", version: "1.0.0" });
      try {
        await client.connect(transport);
        assert.deepEqual(
          (await client.listTools()).tools.map((tool) => tool.name),
          ["search_knowledge"],
        );
        assert.match(diagnostics, /127\.0\.0\.1/);
        assert.match(diagnostics, /Pairing code:/);
      } finally {
        await client.close();
      }
    },
  );
});

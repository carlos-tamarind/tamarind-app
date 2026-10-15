import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agentSearchRequestSchema, agentSearchResponseSchema } from "@/search/agents/schema";
import { mapAgentResults } from "@/search/agents/results";
import { createWorkspaceSearch, type SearchIdentity } from "@/search/search.server";
import { mergeSearchResults } from "@/search/SearchOrchestrator";
import {
  AgentHttpError,
  authenticateAgentRequest,
  authorizeAgentWorkspace,
  type AgentIdentity,
} from "@/search/agents/auth.server";
import { createAgentHandler } from "@/search/agents/http.server";
import { isPlatformOwnerEmail } from "@/lib/platform-owner.server";
import type { SearchResult } from "@/search/types";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";
const session = {
  userId,
  workspaceId,
  email: "owner@example.com",
  expiresAt: Date.now() + 3600_000,
};
const input = { workspaceId, query: "roadmap", scope: "all" as const };
const page: SearchResult = {
  assetId,
  assetType: "page",
  score: 0.8,
  matchedField: "content",
  title: "Roadmap",
  snippet: "A source snippet",
};

function fakeIdentity(
  options: {
    member?: boolean;
    role?: string;
    email?: string;
    dbError?: boolean;
    authError?: boolean;
  } = {},
): AgentIdentity {
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return {
        data:
          options.member === false
            ? null
            : { id: assetId, user_roles: { key: options.role ?? "admin" } },
        error: options.dbError ? new Error("private database details") : null,
      };
    },
  };
  return {
    userId,
    accessToken: "fake-user-token",
    expiresAt: session.expiresAt,
    supabase: {
      from: (table: string) => {
        assert.equal(table, "workspace_users");
        return query;
      },
      auth: {
        getUser: async () => ({
          data: {
            user: options.authError ? null : { id: userId, email: options.email ?? session.email },
          },
          error: options.authError ? new Error("private") : null,
        }),
      },
    } as unknown as AgentIdentity["supabase"],
  };
}

describe("agent search contracts and links", () => {
  it("defaults scope, trims the query and rejects invalid/model credential arguments", () => {
    assert.equal(agentSearchRequestSchema.parse({ workspaceId, query: " roadmap " }).scope, "all");
    assert.equal(
      agentSearchRequestSchema.parse({ workspaceId, query: " roadmap " }).query,
      "roadmap",
    );
    for (const invalid of [
      { ...input, workspaceId: "bad" },
      { ...input, query: " " },
      { ...input, query: "x".repeat(2001) },
      { ...input, scope: "private" },
      { ...input, token: "secret" },
      { ...input, limit: 100 },
    ]) {
      assert.equal(agentSearchRequestSchema.safeParse(invalid).success, false);
    }
    for (const scope of ["all", "pages", "conversations", "users"])
      assert.equal(agentSearchRequestSchema.parse({ ...input, scope }).scope, scope);
  });
  it("keeps ranked order, caps output and maps all navigation targets", () => {
    const results: SearchResult[] = [
      { ...page, chunkId: userId, title: "x".repeat(400), snippet: "y".repeat(600) },
      { ...page, assetType: "conversation", title: undefined },
      { ...page, assetType: "message", conversationId: userId, title: undefined },
      { ...page, assetType: "message" },
      ...Array.from({ length: 25 }, () => page),
    ];
    const output = agentSearchResponseSchema.parse(
      mapAgentResults(input, results, "https://app.tamarind.so"),
    );
    assert.equal(output.results.length, 20);
    assert.equal(output.results[0].title.length, 300);
    assert.equal(output.results[0].snippet.length, 500);
    assert.equal(new URL(output.results[0].url).searchParams.get("k"), userId);
    assert.equal(new URL(output.results[1].url).searchParams.get("c"), assetId);
    assert.equal(output.results[1].title, "Untitled");
    assert.equal(new URL(output.results[2].url).searchParams.get("m"), assetId);
    assert.equal(output.results[2].title, "Message");
    assert.equal(output.results[3].sourceType, "page");
  });
  it("preserves existing merge ranking and deduplication", () => {
    const best = { ...page, score: 0.9 };
    assert.deepEqual(mergeSearchResults([page], [best], 20), [best]);
  });
});

describe("shared search wrapper", () => {
  it("authorizes before building or executing; database errors fail closed", async () => {
    let calls = 0;
    const service = createWorkspaceSearch({
      build: async () => {
        calls++;
        return null;
      },
      search: async () => {
        calls++;
        return { mergedResults: [], keywordResults: [], semanticResults: [] };
      },
    });
    await assert.rejects(service.execute(fakeIdentity({ member: false }), input), /Not a member/);
    await assert.rejects(
      service.execute(fakeIdentity({ dbError: true }), input),
      /authorization failed/,
    );
    assert.equal(calls, 0);
    assert.deepEqual(await service.execute(fakeIdentity(), input), {
      mergedResults: [],
      keywordResults: [],
      semanticResults: [],
    });
    assert.equal(calls, 1);
  });
  it("passes the authenticated client, prepared request and UI options unchanged", async () => {
    const identity = fakeIdentity();
    const request = { workspaceId, query: input.query, scope: input.scope, limit: 20 as const };
    const result = { mergedResults: [page], keywordResults: [page], semanticResults: [] };
    const options = { enableKeywordSearch: false, enableSemanticSearch: true };
    const service = createWorkspaceSearch({
      build: async (params) => {
        assert.equal(params.rawQuery, input.query);
        return request;
      },
      search: async (client, actual, flags) => {
        assert.equal(client, identity.supabase);
        assert.equal(actual, request);
        assert.equal(flags, options);
        return result;
      },
    });
    assert.equal(await service.prepare(identity, input), request);
    assert.equal(await service.execute(identity, input, options), result);
  });
});

describe("agent authorization", () => {
  it("normalizes the existing platform allowlist without exposing it", () => {
    assert.equal(
      isPlatformOwnerEmail("OWNER@EXAMPLE.COM", " other@example.com, owner@example.com "),
      true,
    );
    assert.equal(isPlatformOwnerEmail(null, "owner@example.com"), false);
  });
  it("requires platform owner AND workspace admin, never membership alone", async () => {
    assert.deepEqual(
      await authorizeAgentWorkspace(fakeIdentity(), workspaceId, session.email),
      session,
    );
    for (const options of [
      { email: "ordinary@example.com" },
      { role: "member" },
      { member: false },
    ]) {
      await assert.rejects(
        authorizeAgentWorkspace(fakeIdentity(options), workspaceId, session.email),
        (error: unknown) => error instanceof AgentHttpError && error.status === 403,
      );
    }
    await assert.rejects(
      authorizeAgentWorkspace(fakeIdentity({ dbError: true }), workspaceId, session.email),
      (error: unknown) => error instanceof AgentHttpError && error.status === 500,
    );
    await assert.rejects(
      authorizeAgentWorkspace(fakeIdentity({ authError: true }), workspaceId, session.email),
      (error: unknown) => error instanceof AgentHttpError && error.status === 401,
    );
  });
  it("rejects absent headers, invalid/expired claims and service-role credentials", async () => {
    const env = {
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "fake-publishable-key",
    };
    const request = (value?: string) =>
      new Request("https://app.tamarind.so/api/agents/session", {
        headers: value ? { authorization: value } : {},
      });
    for (const header of [undefined, "Basic x", "Bearer ", "Bearer two tokens"]) {
      await assert.rejects(
        authenticateAgentRequest(request(header), env),
        (error: unknown) => error instanceof AgentHttpError && error.status === 401,
      );
    }
    for (const claims of [
      null,
      { sub: userId, role: "service_role", exp: Date.now() / 1000 + 100 },
      { sub: userId, role: "authenticated", exp: 1 },
    ]) {
      const factory = (() => ({
        auth: { getClaims: async () => ({ data: { claims }, error: null }) },
      })) as unknown as Parameters<typeof authenticateAgentRequest>[2];
      await assert.rejects(
        authenticateAgentRequest(request("Bearer fake"), env, factory),
        (error: unknown) => error instanceof AgentHttpError && error.status === 401,
      );
    }
  });
});

describe("hosted agent HTTP handlers", () => {
  const dependencies = {
    enabled: () => true,
    authenticate: async () => fakeIdentity(),
    authorize: async () => session,
    execute: async (_identity: SearchIdentity) => ({
      mergedResults: [page],
      keywordResults: [page],
      semanticResults: [],
    }),
  };
  const request = (body: unknown = input, method = "POST") =>
    new Request("https://app.tamarind.so/api/agents/search", {
      method,
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    });
  it("returns structured no-store results and verifies sessions without searching", async () => {
    const result = await createAgentHandler("search", dependencies)(request());
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal((await result.json()).results[0].title, "Roadmap");
    const sessionResult = await createAgentHandler("session", {
      ...dependencies,
      execute: async () => {
        throw new Error("must not search");
      },
    })(request({ workspaceId }));
    assert.equal(sessionResult.status, 200);
  });
  it("fails closed before retrieval and sanitizes unexpected errors", async () => {
    for (const status of [401, 403]) {
      const response = await createAgentHandler("search", {
        ...dependencies,
        authorize: async () => {
          throw new AgentHttpError(status, "DENIED", "Denied");
        },
        execute: async () => {
          throw new Error("must not search");
        },
      })(request());
      assert.equal(response.status, status);
    }
    assert.equal(
      (await createAgentHandler("search", { ...dependencies, enabled: () => false })(request()))
        .status,
      404,
    );
    assert.equal(
      (await createAgentHandler("search", dependencies)(request(undefined, "GET"))).status,
      405,
    );
    assert.equal(
      (await createAgentHandler("search", dependencies)(request({ ...input, limit: 100 }))).status,
      400,
    );
    assert.equal(
      (
        await createAgentHandler(
          "search",
          dependencies,
        )(new Request("https://test/", { method: "POST", body: "{" }))
      ).status,
      400,
    );
    assert.equal(
      (
        await createAgentHandler(
          "search",
          dependencies,
        )(request({ ...input, query: "x".repeat(20_000) }))
      ).status,
      400,
    );
    const failed = await createAgentHandler("search", {
      ...dependencies,
      execute: async () => {
        throw new Error("private token details");
      },
    })(request());
    assert.equal(failed.status, 500);
    assert.equal((await failed.text()).includes("private"), false);
  });
});

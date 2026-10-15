import { workspaceSearch } from "../search.server";
import {
  agentSearchRequestSchema,
  agentSearchResponseSchema,
  agentSessionRequestSchema,
  agentSessionSchema,
} from "./schema";
import {
  AgentHttpError,
  agentSearchEnabled,
  authenticateAgentRequest,
  authorizeAgentWorkspace,
} from "./auth.server";
import { mapAgentResults } from "./results";

export function agentJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Bounded streaming reads also reject oversized bodies without Content-Length. */
export async function readAgentJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new AgentHttpError(400, "INVALID_INPUT", "A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) {
        await reader.cancel();
        throw new AgentHttpError(400, "INVALID_INPUT", "The request is too large.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof AgentHttpError) throw error;
    throw new AgentHttpError(400, "INVALID_INPUT", "A valid JSON body is required.");
  } finally {
    reader.releaseLock();
  }
}

export function createAgentHandler(
  kind: "session" | "search",
  dependencies = {
    enabled: agentSearchEnabled,
    authenticate: authenticateAgentRequest,
    authorize: authorizeAgentWorkspace,
    execute: workspaceSearch.execute,
  },
) {
  return async (request: Request): Promise<Response> => {
    if (!dependencies.enabled())
      return agentJson({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);
    if (request.method !== "POST")
      return agentJson({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } }, 405);
    try {
      const identity = await dependencies.authenticate(request);
      const raw = await readAgentJson(request);
      const parsed = (
        kind === "search" ? agentSearchRequestSchema : agentSessionRequestSchema
      ).safeParse(raw);
      if (!parsed.success) throw new AgentHttpError(400, "INVALID_INPUT", "Invalid agent request.");
      const session = agentSessionSchema.parse(
        await dependencies.authorize(identity, parsed.data.workspaceId),
      );
      if (kind === "session") return agentJson(session);
      const input = agentSearchRequestSchema.parse(parsed.data);
      const { mergedResults } = await dependencies.execute(identity, input);
      return agentJson(
        agentSearchResponseSchema.parse(
          mapAgentResults(input, mergedResults, new URL(request.url).origin),
        ),
      );
    } catch (error) {
      if (error instanceof AgentHttpError)
        return agentJson({ error: { code: error.code, message: error.message } }, error.status);
      return agentJson({ error: { code: "SERVER_ERROR", message: "Agent request failed." } }, 500);
    }
  };
}

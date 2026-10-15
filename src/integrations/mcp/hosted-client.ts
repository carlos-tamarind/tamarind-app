import {
  agentSearchResponseSchema,
  agentSessionSchema,
  type AgentSearchRequest,
} from "../../search/agents/schema";
import { HTTP_TIMEOUT_MS, parseHostedOrigin } from "./protocol";

export class HostedRequestError extends Error {
  constructor(public status: number) {
    super(
      status === 401 || status === 403
        ? "Tamarind authorization was rejected. Connect again through Workspace settings."
        : status === 404
          ? "The hosted MCP endpoints are unavailable. Check deployment and feature enablement."
          : "The hosted Tamarind request failed. Check connectivity and try again.",
    );
  }
}

export function createHostedClient(appUrl: string, fetcher: typeof fetch = fetch) {
  const origin = parseHostedOrigin(appUrl);
  async function post(path: string, accessToken: string, body: unknown) {
    let response: Response;
    try {
      response = await fetcher(`${origin}/api/agents/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
    } catch {
      throw new HostedRequestError(0);
    }
    if (!response.ok) throw new HostedRequestError(response.status);
    try {
      // Read a bounded response; never echo an upstream body into diagnostics.
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      let text = "";
      let bytes = 0;
      const decoder = new TextDecoder();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.length;
          if (bytes > 128 * 1024) {
            await reader.cancel();
            throw new Error();
          }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
      return JSON.parse(text) as unknown;
    } catch {
      throw new HostedRequestError(502);
    }
  }
  return {
    origin,
    async verify(accessToken: string, workspaceId: string) {
      try {
        return agentSessionSchema.parse(await post("session", accessToken, { workspaceId }));
      } catch (error) {
        if (error instanceof HostedRequestError) throw error;
        throw new HostedRequestError(502);
      }
    },
    async search(accessToken: string, input: AgentSearchRequest) {
      try {
        const output = agentSearchResponseSchema.parse(await post("search", accessToken, input));
        if (
          output.workspaceId !== input.workspaceId ||
          output.scope !== input.scope ||
          output.results.some((result) => new URL(result.url).origin !== origin)
        )
          throw new Error();
        return output;
      } catch (error) {
        if (error instanceof HostedRequestError) throw error;
        throw new HostedRequestError(502);
      }
    },
  };
}

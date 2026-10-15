import type { SearchResult } from "../types";
import type { AgentSearchRequest, AgentSearchResponse } from "./schema";

function truncate(text: string, limit: number) {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function mapAgentResults(
  input: AgentSearchRequest,
  results: SearchResult[],
  origin: string,
): AgentSearchResponse {
  const mapped: AgentSearchResponse["results"] = [];
  for (const result of results) {
    if (mapped.length === 20) break;
    const url = new URL(`/w/${encodeURIComponent(input.workspaceId)}`, origin);
    if (result.assetType === "page") {
      url.searchParams.set("p", result.pageId ?? result.assetId);
      if (result.chunkId) url.searchParams.set("k", result.chunkId);
    } else if (result.assetType === "message") {
      if (!result.conversationId) continue;
      url.searchParams.set("c", result.conversationId);
      url.searchParams.set("m", result.assetId);
    } else {
      url.searchParams.set("c", result.conversationId ?? result.assetId);
    }
    mapped.push({
      id: result.assetId,
      sourceType: result.assetType,
      title: truncate(
        result.title ?? (result.assetType === "message" ? "Message" : "Untitled"),
        300,
      ),
      snippet: truncate(result.snippet ?? "", 500),
      url: url.href,
    });
  }
  return { workspaceId: input.workspaceId, scope: input.scope, results: mapped };
}

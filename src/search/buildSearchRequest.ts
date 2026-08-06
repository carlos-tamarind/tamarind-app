import { DebugLogger } from "@/lib/debugLogger";
import { embedSearchQuery } from "@/semantic/embedding/embedSearchQuery";

import { MAX_SEARCH_EMBEDDING_TIMEOUT_MS } from "./config";
import { preprocessQuery } from "./preprocessQuery";
import { scopeSupportsSemanticSearch } from "./scope";
import type { SearchRequest, SearchScope } from "./types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function buildSearchRequest(params: {
  workspaceId: string;
  scope: SearchScope;
  rawQuery: string;
}): Promise<SearchRequest | null> {
  const processed = preprocessQuery(params.rawQuery);
  if (!processed) return null;

  const searchRequest: SearchRequest = {
    workspaceId: params.workspaceId,
    query: processed,
    scope: params.scope,
    limit: 20,
  };

  let hasEmbedding = false;

  if (scopeSupportsSemanticSearch(params.scope)) {
    const embeddingResult = await Promise.race([
      embedSearchQuery(processed),
      sleep(MAX_SEARCH_EMBEDDING_TIMEOUT_MS).then(() => "timeout" as const),
    ]);

    if (embeddingResult === "timeout") {
      DebugLogger.log({
        scope: "search-api",
        event: "searchRequestEmbedding",
        level: "warn",
        message:
          "Embedding task hit timeout cap. No embedding will be provided on the search request",
      });
    } else if (embeddingResult !== undefined) {
      searchRequest.embedding = embeddingResult;
      hasEmbedding = true;
    }
  }

  DebugLogger.log({
    scope: "search-api",
    event: `searchRequest built successfully ${hasEmbedding ? "with embedding" : "without embedding"}`,
    message: `query="${searchRequest.query}" scope=${searchRequest.scope} embedding=${searchRequest.embedding?.length ?? "none"} dims`,
  });

  return searchRequest;
}

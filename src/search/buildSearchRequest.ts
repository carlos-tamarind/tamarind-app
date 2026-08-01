import { DebugLogger } from "@/lib/debugLogger";
import { embedSearchQuery } from "@/semantic/embedding/embedSearchQuery";

import { MAX_SEARCH_EMBEDDING_TIMEOUT_MS } from "./config";
import { preprocessQuery } from "./preprocessQuery";
import type { SearchRequest, SearchScope } from "./types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function buildSearchRequest(params: {
  scope: SearchScope;
  rawQuery: string;
}): Promise<SearchRequest | null> {
  const processed = preprocessQuery(params.rawQuery);
  if (!processed) return null;

  const embeddingResult = await Promise.race([
    embedSearchQuery(processed),
    sleep(MAX_SEARCH_EMBEDDING_TIMEOUT_MS).then(() => "timeout" as const),
  ]);

  const searchRequest: SearchRequest = {
    query: processed,
    scope: params.scope,
    limit: 20,
  };

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
  }

  const hasEmbedding =
    embeddingResult !== undefined && embeddingResult !== "timeout";

  DebugLogger.log({
    scope: "search-api",
    event: `searchRequest built successfully ${hasEmbedding ? "with embedding" : "without embedding"}`,
    message: `query="${searchRequest.query}" scope=${searchRequest.scope} embedding=${searchRequest.embedding?.length ?? "none"} dims`,
  });

  return searchRequest;
}

import { DebugLogger } from "@/lib/debugLogger";
import { formatEmbeddingVector } from "@/lib/vector/formatEmbeddingVector";

import { scopeSupportsSemanticSearch } from "../../scope";
import type {
  SearchMatchedField,
  SearchRequest,
  SearchResult,
  SearchStrategy,
  SearchSupabaseClient,
} from "../../types";
import { extractSnippet } from "../../utils/snippet";
import { SEMANTIC_SEARCH_CONFIG } from "./config";

type SemanticRpcRow = {
  asset_id: string;
  conversation_id: string;
  title: string | null;
  match_text: string;
  matched_field: SearchMatchedField;
  score: number;
};

function mapRow(row: SemanticRpcRow, query: string): SearchResult {
  return {
    assetType: "message",
    assetId: row.asset_id,
    score: row.score,
    snippet: extractSnippet(row.match_text, query),
    matchedField: "content",
    conversationId: row.conversation_id,
  };
}

function dedupeResults(results: SearchResult[]): SearchResult[] {
  const byAssetId = new Map<string, SearchResult>();

  for (const result of results) {
    const existing = byAssetId.get(result.assetId);
    if (!existing || result.score > existing.score) {
      byAssetId.set(result.assetId, result);
    }
  }

  return [...byAssetId.values()];
}

export class SemanticSearchStrategy implements SearchStrategy {
  async search(
    supabase: SearchSupabaseClient,
    request: SearchRequest,
  ): Promise<SearchResult[]> {
    const timer = DebugLogger.time("searchStratSemantic", "Total elapsed time");
    try {
      if (!scopeSupportsSemanticSearch(request.scope) || !request.embedding) {
        return [];
      }

      const { data, error } = await supabase.rpc("search_messages_semantic", {
        p_workspace_id: request.workspaceId,
        p_embedding: formatEmbeddingVector(request.embedding),
        p_limit: request.limit,
        p_similarity_threshold: SEMANTIC_SEARCH_CONFIG.EMBEDDING_THRESHOLD,
        p_weight_similarity: SEMANTIC_SEARCH_CONFIG.SCORE_WEIGHT_SIMILARITY,
        p_weight_quality: SEMANTIC_SEARCH_CONFIG.SCORE_WEIGHT_QUALITY,
        p_weight_recency: SEMANTIC_SEARCH_CONFIG.SCORE_WEIGHT_RECENCY,
        p_recency_half_life_days: SEMANTIC_SEARCH_CONFIG.RECENCY_HALF_LIFE_DAYS,
      });

      if (error) {
        DebugLogger.log({
          scope: "searchStratSemantic",
          event: "error",
          level: "error",
          message: `search_messages_semantic: ${error.message}`,
        });
        return [];
      }

      const rows = (data ?? []) as SemanticRpcRow[];
      const mapped = rows.map((row) => mapRow(row, request.query));
      const deduped = dedupeResults(mapped);
      const ranked = deduped.sort((a, b) => b.score - a.score).slice(0, request.limit);

      DebugLogger.log({
        scope: "searchStratSemantic",
        event: "searchResults",
        level: "log",
        message: `Found ${ranked.length} results`,
      });

      return ranked;
    } finally {
      timer.end();
    }
  }
}

import { DebugLogger } from "@/lib/debugLogger";
import { formatEmbeddingVector } from "@/lib/vector/embeddingVectorUtil";
import { PAGE_CHUNK_CONFIG } from "@/semantic/pages/page-chunks/engine/config";

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

type MessageSemanticRpcRow = {
  asset_id: string;
  conversation_id: string;
  title: string | null;
  match_text: string;
  matched_field: SearchMatchedField;
  score: number;
};

type PageSemanticRpcRow = {
  asset_id: string;
  chunk_id: string | null;
  title: string | null;
  match_text: string;
  matched_field: SearchMatchedField;
  score: number;
};

function mapMessageRow(row: MessageSemanticRpcRow, query: string): SearchResult {
  return {
    assetType: "message",
    assetId: row.asset_id,
    score: row.score,
    snippet: extractSnippet(row.match_text, query),
    matchedField: "content",
    conversationId: row.conversation_id,
  };
}

function mapPageRow(row: PageSemanticRpcRow, query: string): SearchResult {
  return {
    assetType: "page",
    assetId: row.asset_id,
    pageId: row.asset_id,
    chunkId: row.chunk_id ?? undefined,
    score: row.score,
    title: row.title ?? undefined,
    snippet: extractSnippet(row.match_text, query),
    matchedField: "content",
  };
}

function dedupeResults(results: SearchResult[]): SearchResult[] {
  const byKey = new Map<string, SearchResult>();

  for (const result of results) {
    const key = `${result.assetType}:${result.assetId}`;
    const existing = byKey.get(key);
    if (!existing || result.score > existing.score) {
      byKey.set(key, result);
    }
  }

  return [...byKey.values()];
}

async function searchMessagesSemantic(
  supabase: SearchSupabaseClient,
  request: SearchRequest,
  embedding: number[],
): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc("search_messages_semantic", {
    p_workspace_id: request.workspaceId,
    p_embedding: formatEmbeddingVector(embedding),
    p_limit: request.limit,
    p_similarity_threshold: SEMANTIC_SEARCH_CONFIG.MESSAGE_EMBEDDING_THRESHOLD,
    p_weight_similarity: SEMANTIC_SEARCH_CONFIG.MESSAGE_SCORE_WEIGHT_SIMILARITY,
    p_weight_quality: SEMANTIC_SEARCH_CONFIG.MESSAGE_SCORE_WEIGHT_QUALITY,
    p_weight_recency: SEMANTIC_SEARCH_CONFIG.MESSAGE_SCORE_WEIGHT_RECENCY,
    p_recency_half_life_days: SEMANTIC_SEARCH_CONFIG.MESSAGE_RECENCY_HALF_LIFE_DAYS,
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as MessageSemanticRpcRow[]).map((row) => mapMessageRow(row, request.query));
}

async function searchPagesSemantic(
  supabase: SearchSupabaseClient,
  request: SearchRequest,
  embedding: number[],
): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc("search_pages_semantic", {
    p_workspace_id: request.workspaceId,
    p_embedding: formatEmbeddingVector(embedding),
    p_limit: request.limit,
    p_similarity_threshold: SEMANTIC_SEARCH_CONFIG.PAGE_EMBEDDING_THRESHOLD,
    p_weight_similarity: SEMANTIC_SEARCH_CONFIG.PAGE_SCORE_WEIGHT_SIMILARITY,
    p_weight_recency: SEMANTIC_SEARCH_CONFIG.PAGE_SCORE_WEIGHT_RECENCY,
    p_recency_half_life_days: SEMANTIC_SEARCH_CONFIG.PAGE_RECENCY_HALF_LIFE_DAYS,
    p_embedding_model: PAGE_CHUNK_CONFIG.PAGE_EMBEDDING_MODEL,
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as PageSemanticRpcRow[]).map((row) => mapPageRow(row, request.query));
}

export class SemanticSearchStrategy implements SearchStrategy {
  async search(supabase: SearchSupabaseClient, request: SearchRequest): Promise<SearchResult[]> {
    const timer = DebugLogger.time("searchStratSemantic", "Total elapsed time");
    try {
      const embedding = request.embedding;
      if (!scopeSupportsSemanticSearch(request.scope) || !embedding) {
        return [];
      }

      const searches: { name: string; run: () => Promise<SearchResult[]> }[] = [];

      if (request.scope === "all" || request.scope === "conversations") {
        searches.push({
          name: "search_messages_semantic",
          run: () => searchMessagesSemantic(supabase, request, embedding),
        });
      }

      if (request.scope === "all" || request.scope === "pages") {
        searches.push({
          name: "search_pages_semantic",
          run: () => searchPagesSemantic(supabase, request, embedding),
        });
      }

      const settled = await Promise.allSettled(searches.map((search) => search.run()));
      const results: SearchResult[] = [];

      for (let i = 0; i < settled.length; i++) {
        const outcome = settled[i];
        const rpcName = searches[i].name;

        if (outcome.status === "rejected") {
          const message =
            outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);

          DebugLogger.log({
            scope: "searchStratSemantic",
            event: "error",
            level: "error",
            message: `${rpcName}: ${message}`,
          });
          continue;
        }

        results.push(...outcome.value);
      }

      const deduped = dedupeResults(results);
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

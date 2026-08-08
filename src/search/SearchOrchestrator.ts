import { DebugLogger } from "@/lib/debugLogger";

import { MAX_SEARCH_STRATEGY_TIMEOUT_MS } from "./config";
import { KeywordSearchStrategy } from "./strategies/keywords/KeywordSearchStrategy";
import { SemanticSearchStrategy } from "./strategies/semantic/SemanticSearchStrategy";
import type {
  SearchOrchestratorResponse,
  SearchRequest,
  SearchResult,
  SearchStrategyKind,
  SearchSupabaseClient,
} from "./types";

export type SearchOrchestratorOptions = {
  enableKeywordSearch?: boolean;
  enableSemanticSearch?: boolean;
};

function withTimeout(
  strategy: SearchStrategyKind,
  promise: Promise<SearchResult[]>,
): Promise<SearchResult[]> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      DebugLogger.log({
        scope: "search-api",
        event: "strategyTimeout",
        level: "warn",
        message: `${strategy} strategy exceeded ${MAX_SEARCH_STRATEGY_TIMEOUT_MS}ms and was dropped`,
      });
      resolve([]);
    }, MAX_SEARCH_STRATEGY_TIMEOUT_MS);

    promise
      .then((results) => resolve(results))
      .catch(() => resolve([]))
      .finally(() => clearTimeout(timer));
  });
}

function tag(results: SearchResult[], strategy: SearchStrategyKind): SearchResult[] {
  return results.map((result) => ({ ...result, strategy }));
}

export function mergeSearchResults(
  keywordResults: SearchResult[],
  semanticResults: SearchResult[],
  limit: number,
): SearchResult[] {
  const byKey = new Map<string, SearchResult>();

  for (const result of [...keywordResults, ...semanticResults]) {
    const key = `${result.assetType}:${result.assetId}`;
    const existing = byKey.get(key);
    if (!existing || result.score > existing.score) {
      byKey.set(key, result);
    }
  }

  return [...byKey.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

export class SearchOrchestrator {
  constructor(
    private keywordStrategy = new KeywordSearchStrategy(),
    private semanticStrategy = new SemanticSearchStrategy(),
  ) {}

  async search(
    supabase: SearchSupabaseClient,
    request: SearchRequest,
    options: SearchOrchestratorOptions = {},
  ): Promise<SearchOrchestratorResponse> {
    const enableKeywordSearch = options.enableKeywordSearch ?? true;
    const enableSemanticSearch = options.enableSemanticSearch ?? true;

    const [rawKeyword, rawSemantic] = await Promise.all([
      enableKeywordSearch
        ? withTimeout("keyword", this.keywordStrategy.search(supabase, request))
        : Promise.resolve([]),
      enableSemanticSearch
        ? withTimeout("semantic", this.semanticStrategy.search(supabase, request))
        : Promise.resolve([]),
    ]);

    const keywordResults = tag(rawKeyword, "keyword");
    const semanticResults = tag(rawSemantic, "semantic");

    return {
      keywordResults,
      semanticResults,
      mergedResults: mergeSearchResults(keywordResults, semanticResults, request.limit),
    };
  }
}

export const searchOrchestrator = new SearchOrchestrator();

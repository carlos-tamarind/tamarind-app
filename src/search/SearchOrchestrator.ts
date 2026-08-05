import { KeywordSearchStrategy } from "./strategies/keywords/KeywordSearchStrategy";
import type { SearchRequest, SearchResult, SearchSupabaseClient } from "./types";

export class SearchOrchestrator {
  constructor(private keywordStrategy = new KeywordSearchStrategy()) {}

  search(
    supabase: SearchSupabaseClient,
    request: SearchRequest,
  ): Promise<SearchResult[]> {
    return this.keywordStrategy.search(supabase, request);
  }
}

export const searchOrchestrator = new SearchOrchestrator();

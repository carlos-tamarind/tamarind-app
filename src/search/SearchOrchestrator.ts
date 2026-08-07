import { KeywordSearchStrategy } from "./strategies/keywords/KeywordSearchStrategy";
import { SemanticSearchStrategy } from "./strategies/semantic/SemanticSearchStrategy";
import type {
  SearchOrchestratorResponse,
  SearchRequest,
  SearchSupabaseClient,
} from "./types";

export type SearchOrchestratorOptions = {
  enableKeywordSearch?: boolean;
  enableSemanticSearch?: boolean;
};

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

    const [keywordResults, semanticResults] = await Promise.all([
      enableKeywordSearch
        ? this.keywordStrategy.search(supabase, request)
        : Promise.resolve([]),
      enableSemanticSearch
        ? this.semanticStrategy.search(supabase, request)
        : Promise.resolve([]),
    ]);

    return { keywordResults, semanticResults };
  }
}

export const searchOrchestrator = new SearchOrchestrator();

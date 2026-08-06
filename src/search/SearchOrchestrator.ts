import { KeywordSearchStrategy } from "./strategies/keywords/KeywordSearchStrategy";
import { SemanticSearchStrategy } from "./strategies/semantic/SemanticSearchStrategy";
import type {
  SearchOrchestratorResponse,
  SearchRequest,
  SearchSupabaseClient,
} from "./types";

export class SearchOrchestrator {
  constructor(
    private keywordStrategy = new KeywordSearchStrategy(),
    private semanticStrategy = new SemanticSearchStrategy(),
  ) {}

  async search(
    supabase: SearchSupabaseClient,
    request: SearchRequest,
  ): Promise<SearchOrchestratorResponse> {
    const [keywordResults, semanticResults] = await Promise.all([
      this.keywordStrategy.search(supabase, request),
      this.semanticStrategy.search(supabase, request),
    ]);

    return { keywordResults, semanticResults };
  }
}

export const searchOrchestrator = new SearchOrchestrator();

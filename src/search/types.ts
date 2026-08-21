import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";

export const searchScopeSchema = z.enum(["all", "conversations", "pages", "users"]);
export type SearchScope = z.infer<typeof searchScopeSchema>;

export type SearchMatchedField = "title" | "content" | "name";

export type SearchRequest = {
  workspaceId: string;
  query: string;
  embedding?: number[];
  scope: SearchScope;
  limit: 20;
};

export type SearchStrategyKind = "keyword" | "semantic";

export type SearchResult = {
  assetType: "page" | "conversation" | "message";
  assetId: string;
  score: number;
  title?: string;
  snippet?: string;
  matchedField: SearchMatchedField;
  conversationId?: string;
  pageId?: string;
  chunkId?: string;
  strategy?: SearchStrategyKind;
};

export type SearchOrchestratorResponse = {
  keywordResults: SearchResult[];
  semanticResults: SearchResult[];
  mergedResults: SearchResult[];
};


export type SearchSupabaseClient = SupabaseClient<Database>;

export interface SearchStrategy {
  search(supabase: SearchSupabaseClient, request: SearchRequest): Promise<SearchResult[]>;
}

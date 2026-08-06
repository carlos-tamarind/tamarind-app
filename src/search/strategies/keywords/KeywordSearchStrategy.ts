import { DebugLogger } from "@/lib/debugLogger";

import type {
  SearchMatchedField,
  SearchRequest,
  SearchResult,
  SearchScope,
  SearchStrategy,
  SearchSupabaseClient,
} from "../../types";
import { extractSnippet } from "../../utils/snippet";

type KeywordRpcName =
  | "search_pages_keyword"
  | "search_conversations_keyword"
  | "search_messages_keyword"
  | "search_people_keyword";

type KeywordRpcRow = {
  asset_id: string;
  title: string | null;
  match_text: string;
  matched_field: SearchMatchedField;
  score: number;
  conversation_id?: string;
};

const SCOPE_RPCS: Record<SearchScope, KeywordRpcName[]> = {
  all: [
    "search_pages_keyword",
    "search_conversations_keyword",
    "search_messages_keyword",
    "search_people_keyword",
  ],
  pages: ["search_pages_keyword"],
  conversations: ["search_conversations_keyword", "search_messages_keyword"],
  users: ["search_people_keyword"],
};

function rpcParams(request: SearchRequest) {
  return {
    p_workspace_id: request.workspaceId,
    p_query: request.query,
    p_limit: request.limit,
  };
}

function mapPageRow(row: KeywordRpcRow, query: string): SearchResult {
  const matchedField = row.matched_field;
  const snippet =
    matchedField === "title"
      ? row.title ?? row.match_text
      : extractSnippet(row.match_text, query);

  return {
    assetType: "page",
    assetId: row.asset_id,
    pageId: row.asset_id,
    score: row.score,
    title: row.title ?? undefined,
    snippet,
    matchedField,
  };
}

function mapConversationRow(row: KeywordRpcRow): SearchResult {
  const title = row.title ?? undefined;

  return {
    assetType: "conversation",
    assetId: row.asset_id,
    conversationId: row.asset_id,
    score: row.score,
    title,
    snippet: title ?? row.match_text,
    matchedField: row.matched_field,
  };
}

function mapMessageRow(row: KeywordRpcRow, query: string): SearchResult {
  return {
    assetType: "message",
    assetId: row.asset_id,
    conversationId: row.conversation_id,
    score: row.score,
    snippet: extractSnippet(row.match_text, query),
    matchedField: row.matched_field,
  };
}

function mapPeopleRow(row: KeywordRpcRow): SearchResult {
  const title = row.title ?? undefined;

  return {
    assetType: "conversation",
    assetId: row.asset_id,
    conversationId: row.asset_id,
    score: row.score,
    title,
    snippet: title ?? row.match_text,
    matchedField: row.matched_field,
  };
}

function mapRpcRows(
  rpcName: KeywordRpcName,
  rows: KeywordRpcRow[],
  query: string,
): SearchResult[] {
  switch (rpcName) {
    case "search_pages_keyword":
      return rows.map((row) => mapPageRow(row, query));
    case "search_conversations_keyword":
      return rows.map((row) => mapConversationRow(row));
    case "search_messages_keyword":
      return rows.map((row) => mapMessageRow(row, query));
    case "search_people_keyword":
      return rows.map((row) => mapPeopleRow(row));
  }
}

async function callKeywordRpc(
  supabase: SearchSupabaseClient,
  rpcName: KeywordRpcName,
  request: SearchRequest,
): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc(rpcName, rpcParams(request));

  if (error) {
    throw new Error(error.message);
  }

  return mapRpcRows(rpcName, (data ?? []) as KeywordRpcRow[], request.query);
}

export class KeywordSearchStrategy implements SearchStrategy {
  async search(
    supabase: SearchSupabaseClient,
    request: SearchRequest,
  ): Promise<SearchResult[]> {
    const timer = DebugLogger.time("searchStratKeywords", "Total elapsed time");
    try {
      if (!request.query.trim()) {
        return [];
      }

      const rpcNames = SCOPE_RPCS[request.scope];
      const settled = await Promise.allSettled(
        rpcNames.map((rpcName) => callKeywordRpc(supabase, rpcName, request)),
      );

      const results: SearchResult[] = [];

      for (let i = 0; i < settled.length; i++) {
        const outcome = settled[i];
        const rpcName = rpcNames[i];

        if (outcome.status === "rejected") {
          const message =
            outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason);

          DebugLogger.log({
            scope: "searchStratKeywords",
            event: "error",
            level: "error",
            message: `${rpcName}: ${message}`,
          });
          continue;
        }

        results.push(...outcome.value);
      }

      const ranked = results.sort((a, b) => b.score - a.score).slice(0, request.limit);

      DebugLogger.log({
        scope: "searchStratKeywords",
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

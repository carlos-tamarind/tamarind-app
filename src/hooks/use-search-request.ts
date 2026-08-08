import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { DebugLogger } from "@/lib/debugLogger";
import { executeSearch as executeSearchFn } from "@/lib/search.functions";
import type { SearchResult, SearchScope } from "@/search/types";

const DEBOUNCE_MS = 1500;

function logStrategyResults(strategy: "keyword" | "semantic", results: SearchResult[]) {
  DebugLogger.table({
    scope: "search-api",
    event: `search results for ${strategy}`,
    collapsed: true,
    data: Object.fromEntries(results.map((r, i) => [String(i), r])),
  });
}

export function useSearchRequest({
  workspaceId,
  open,
  query,
  scope,
  enableKeywordSearch,
  enableSemanticSearch,
}: {
  workspaceId: string;
  open: boolean;
  query: string;
  scope: SearchScope;
  enableKeywordSearch: boolean;
  enableSemanticSearch: boolean;
}) {
  const executeSearchServer = useServerFn(executeSearchFn);
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [keywordResults, setKeywordResults] = useState<SearchResult[]>([]);
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const executeSearch = useCallback(async () => {
    const id = ++requestIdRef.current;
    setIsLoading(true);

    if (!enableKeywordSearch && !enableSemanticSearch) {
      setKeywordResults([]);
      setSemanticResults([]);
      setIsLoading(false);
      return;
    }

    try {
      const { keywordResults, semanticResults } = await executeSearchServer({
        data: {
          workspaceId,
          query,
          scope,
          enableKeywordSearch,
          enableSemanticSearch,
        },
      });

      if (id !== requestIdRef.current) return;

      setKeywordResults(keywordResults);
      setSemanticResults(semanticResults);

      if (enableKeywordSearch) {
        logStrategyResults("keyword", keywordResults);
      }
      if (enableSemanticSearch) {
        logStrategyResults("semantic", semanticResults);
      }
    } catch {
      // No UI feedback for errors yet.
    } finally {
      if (id === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    workspaceId,
    query,
    scope,
    enableKeywordSearch,
    enableSemanticSearch,
    executeSearchServer,
  ]);

  const searchNow = useCallback(() => {
    if (!open) return;
    clearDebounce();
    void executeSearch();
  }, [open, clearDebounce, executeSearch]);

  useEffect(() => {
    if (!open) {
      requestIdRef.current += 1;
      clearDebounce();
      setIsLoading(false);
      return;
    }

    clearDebounce();
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void executeSearch();
    }, DEBOUNCE_MS);

    return clearDebounce;
  }, [
    open,
    query,
    scope,
    enableKeywordSearch,
    enableSemanticSearch,
    clearDebounce,
    executeSearch,
  ]);

  return { isLoading, searchNow, keywordResults, semanticResults };
}

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
  const lastSignatureRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  const signature = JSON.stringify({
    workspaceId,
    query,
    scope,
    enableKeywordSearch,
    enableSemanticSearch,
  });

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const executeSearch = useCallback(async () => {
    const id = ++requestIdRef.current;
    lastSignatureRef.current = signature;
    setIsLoading(true);
    setHasError(false);

    if (!enableKeywordSearch && !enableSemanticSearch) {
      setResults([]);
      setHasSearched(true);
      setIsLoading(false);
      return;
    }

    try {
      const { keywordResults, semanticResults, mergedResults } = await executeSearchServer({
        data: {
          workspaceId,
          query,
          scope,
          enableKeywordSearch,
          enableSemanticSearch,
        },
      });

      if (id !== requestIdRef.current) return;

      setResults(mergedResults);
      setHasSearched(true);

      if (enableKeywordSearch) {
        logStrategyResults("keyword", keywordResults);
      }
      if (enableSemanticSearch) {
        logStrategyResults("semantic", semanticResults);
      }
    } catch {
      if (id === requestIdRef.current) {
        setResults([]);
        setHasSearched(true);
        setHasError(true);
      }
    } finally {
      if (id === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    workspaceId,
    query,
    scope,
    signature,
    enableKeywordSearch,
    enableSemanticSearch,
    executeSearchServer,
  ]);

  const searchNow = useCallback(() => {
    if (!open || !query.trim()) return;
    clearDebounce();
    void executeSearch();
  }, [open, query, clearDebounce, executeSearch]);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    lastSignatureRef.current = null;
    clearDebounce();
    setResults([]);
    setHasSearched(false);
    setHasError(false);
    setIsLoading(false);
  }, [clearDebounce]);

  useEffect(() => {
    if (!open) {
      requestIdRef.current += 1;
      clearDebounce();
      setIsLoading(false);
      return;
    }

    // Nothing changed since the last search — keep showing previous results.
    if (lastSignatureRef.current === signature) return;

    if (!query.trim()) {
      clearDebounce();
      return;
    }

    clearDebounce();
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void executeSearch();
    }, DEBOUNCE_MS);

    return clearDebounce;
  }, [open, signature, clearDebounce, executeSearch]);

  return { isLoading, searchNow, reset, results, hasSearched, hasError };
}

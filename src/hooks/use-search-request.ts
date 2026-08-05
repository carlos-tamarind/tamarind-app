import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { executeSearch as executeSearchFn } from "@/lib/search.functions";
import type { SearchScope } from "@/search/types";

const DEBOUNCE_MS = 500;

export function useSearchRequest({
  workspaceId,
  open,
  query,
  scope,
}: {
  workspaceId: string;
  open: boolean;
  query: string;
  scope: SearchScope;
}) {
  const executeSearchServer = useServerFn(executeSearchFn);
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const executeSearch = useCallback(async () => {
    const id = ++requestIdRef.current;
    setIsLoading(true);
    try {
      await executeSearchServer({ data: { workspaceId, query, scope } });
    } catch {
      // No UI feedback for errors yet.
    } finally {
      if (id === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [workspaceId, query, scope, executeSearchServer]);

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
  }, [open, query, scope, clearDebounce, executeSearch]);

  return { isLoading, searchNow };
}

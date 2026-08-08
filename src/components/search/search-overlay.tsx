import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileText, Loader2, MessageSquareMore, SlidersHorizontal, User } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSearchRequest } from "@/hooks/use-search-request";
import type { SearchResult, SearchScope } from "@/search/types";

const IS_DEV = import.meta.env.DEV;

const FILTERS: {
  value: SearchScope;
  label: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  { value: "all", label: "All" },
  { value: "conversations", label: "Conversations & messages", icon: MessageSquareMore },
  { value: "pages", label: "Pages", icon: FileText },
  { value: "users", label: "Users & conversations", icon: User },
];

const STRATEGY_TOGGLES = [
  { key: "keyword" as const, label: "Keyword search" },
  { key: "semantic" as const, label: "Semantic search" },
];

const STRATEGY_LABELS: Record<"keyword" | "semantic", string> = {
  keyword: "Keyword match",
  semantic: "Semantic match",
};

function resultIcon(assetType: SearchResult["assetType"]) {
  return assetType === "page" ? FileText : MessageSquareMore;
}

function ResultRow({
  result,
  onSelect,
}: {
  result: SearchResult;
  onSelect: (result: SearchResult) => void;
}) {
  const Icon = resultIcon(result.assetType);
  const title =
    result.title ?? (result.assetType === "message" ? "Message" : "Untitled");

  return (
    <button
      type="button"
      onClick={() => onSelect(result)}
      className="flex w-full flex-col items-start gap-0.5 px-6 py-3 text-left transition-colors hover:bg-accent"
    >
      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 shrink-0" strokeWidth={1.5} />
        <span className="truncate">{title}</span>
      </span>
      {result.matchedField === "content" && result.snippet ? (
        <span className="line-clamp-2 text-xs italic text-muted-foreground">
          {result.snippet}
        </span>
      ) : null}
      {IS_DEV && result.strategy ? (
        <span className="text-[11px] font-light text-muted-foreground/70">
          {STRATEGY_LABELS[result.strategy]} · {result.score.toFixed(3)}
        </span>
      ) : null}
    </button>
  );
}

export function SearchOverlay({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [showFilters, setShowFilters] = useState(true);
  const [enableKeywordSearch, setEnableKeywordSearch] = useState(true);
  const [enableSemanticSearch, setEnableSemanticSearch] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isLoading, searchNow, results, hasSearched, hasError } = useSearchRequest({
    workspaceId,
    open,
    query,
    scope,
    enableKeywordSearch: IS_DEV ? enableKeywordSearch : true,
    enableSemanticSearch: IS_DEV ? enableSemanticSearch : true,
  });

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(id);
  }, [open]);

  const chipClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
      active
        ? "border-foreground bg-foreground text-background"
        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
    }`;

  const handleSelect = (result: SearchResult) => {
    onOpenChange(false);
    if (result.assetType === "page") {
      const pageId = result.pageId ?? result.assetId;
      void navigate({
        to: "/w/$workspaceId",
        params: { workspaceId },
        search: (prev: Record<string, unknown>) => ({ ...prev, p: pageId }),
      });
      return;
    }
    const conversationId = result.conversationId ?? result.assetId;
    void navigate({
      to: "/w/$workspaceId",
      params: { workspaceId },
      search: (prev: Record<string, unknown>) => ({ ...prev, c: conversationId }),
    });
  };

  const hasResults = results.length > 0;
  const showEmpty = hasSearched && !hasError && !isLoading && !hasResults;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-[55vw] max-w-[900px] flex-col gap-0 p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>

        <div className="flex min-h-[68px] shrink-0 items-center gap-3 px-6 pr-14">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                searchNow();
              }
            }}
            placeholder="Search anything…"
            className="min-w-0 flex-1 bg-transparent text-2xl font-light outline-none placeholder:text-muted-foreground/60"
          />
          <TooltipProvider delayDuration={2000}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  aria-label="Filter your search"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <SlidersHorizontal className="size-4" strokeWidth={1.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Filter your search</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {showFilters ? (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 pb-2">
              {FILTERS.map(({ value, label, icon: Icon }) => {
                const active = scope === value;
                return (
                  <button
                    key={value}
                    onClick={() => setScope(active ? "all" : value)}
                    aria-pressed={active}
                    className={chipClass(active)}
                  >
                    {Icon ? <Icon className="size-3.5" strokeWidth={1.5} /> : null}
                    {label}
                  </button>
                );
              })}
            </div>

            {IS_DEV ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 pb-2">
                {STRATEGY_TOGGLES.map(({ key, label }) => {
                  const active = key === "keyword" ? enableKeywordSearch : enableSemanticSearch;
                  const setActive =
                    key === "keyword" ? setEnableKeywordSearch : setEnableSemanticSearch;
                  return (
                    <button
                      key={key}
                      onClick={() => setActive((v) => !v)}
                      aria-pressed={active}
                      className={chipClass(active)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : null}

        <div className="shrink-0 px-6 pb-4 pt-1 text-sm text-muted-foreground">
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
              Searching…
            </span>
          ) : hasError ? (
            <span>Something went wrong. Try again.</span>
          ) : showEmpty ? (
            <span>No results. Try a different search or remove a filter.</span>
          ) : hasResults ? (
            <span>
              {results.length} result{results.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        <div
          className="overflow-y-auto transition-[max-height] duration-300 ease-out"
          style={{ maxHeight: hasResults && !isLoading && !hasError ? "45vh" : "0px" }}
        >
          <ul className="divide-y divide-border border-t border-border">
            {results.map((result) => (
              <li key={`${result.assetType}-${result.assetId}`}>
                <ResultRow result={result} onSelect={handleSelect} />
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

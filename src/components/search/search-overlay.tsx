import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, MessageSquareMore, SlidersHorizontal, User } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSearchRequest } from "@/hooks/use-search-request";
import type { SearchResult, SearchScope } from "@/search/types";

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

function StrategyResultsSection({
  title,
  results,
}: {
  title: string;
  results: SearchResult[];
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">
        {title} ({results.length})
      </h3>
      {results.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">No results</p>
      ) : (
        <ul className="space-y-2">
          {results.map((result) => (
            <li
              key={`${result.assetType}-${result.assetId}`}
              className="rounded border border-border p-2 font-mono text-xs"
            >
              <pre className="whitespace-pre-wrap break-all">{JSON.stringify(result, null, 2)}</pre>
            </li>
          ))}
        </ul>
      )}
    </section>
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
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [showFilters, setShowFilters] = useState(true);
  const [enableKeywordSearch, setEnableKeywordSearch] = useState(true);
  const [enableSemanticSearch, setEnableSemanticSearch] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isLoading, searchNow, keywordResults, semanticResults } = useSearchRequest({
    workspaceId,
    open,
    query,
    scope,
    enableKeywordSearch,
    enableSemanticSearch,
  });

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (open) return;
    setQuery("");
    setScope("all");
    setShowFilters(true);
    setEnableKeywordSearch(true);
    setEnableSemanticSearch(true);
  }, [open]);

  const chipClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
      active
        ? "border-foreground bg-foreground text-background"
        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
    }`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[35vh] min-h-[380px] w-[55vw] max-w-[900px] flex-col gap-0 p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>

        <div className="flex h-1/5 min-h-[72px] shrink-0 items-center gap-3 px-6 pr-14">
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

            <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 pb-3">
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
          </>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
              Searching…
            </div>
          ) : (
            <div className="space-y-6 pt-2">
              <StrategyResultsSection title="Keyword results" results={keywordResults} />
              <StrategyResultsSection title="Semantic results" results={semanticResults} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

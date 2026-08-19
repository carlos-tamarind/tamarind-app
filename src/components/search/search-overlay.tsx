import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CircleX, FileText, Loader2, MessageSquareMore, Search, User } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { OverlayFooter } from "@/components/overlay-footer";
import { HOTKEYS, useHotkey, useShortcutLabel } from "@/hooks/use-hotkeys";
import { useSearchRequest } from "@/hooks/use-search-request";
import type { SearchResult, SearchScope } from "@/search/types";

/** Sentinel: query input is the virtual first item of the result list. */
const QUERY_INDEX = -1;

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

const GROUP_ORDER: SearchResult["assetType"][] = ["page", "conversation", "message"];

const GROUP_LABELS: Record<SearchResult["assetType"], string> = {
  page: "Pages",
  conversation: "Conversations",
  message: "Messages",
};

function resultIcon(assetType: SearchResult["assetType"]) {
  if (assetType === "page") return FileText;
  if (assetType === "conversation") return User;
  return MessageSquareMore;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wraps every query term found in the snippet so the reason a result matched
 * is visible at a glance rather than something you have to hunt for.
 */
function highlight(text: string, query: string) {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .map(escapeRegExp);
  if (terms.length === 0) return text;

  // String.split with a capture group interleaves matches at odd indices.
  const pattern = new RegExp(`(${terms.join("|")})`, "gi");
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="rounded-[2px] bg-accent-subtle px-0.5 text-accent-subtle-foreground"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function ResultRow({
  result,
  query,
  active,
  index,
  onSelect,
  onHover,
  onKeyDown,
}: {
  result: SearchResult;
  query: string;
  active: boolean;
  index: number;
  onSelect: (result: SearchResult) => void;
  onHover: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const Icon = resultIcon(result.assetType);
  const title =
    result.title ?? (result.assetType === "message" ? "Message" : "Untitled");

  return (
    <button
      type="button"
      tabIndex={-1}
      data-result-index={index}
      onClick={() => onSelect(result)}
      onMouseMove={onHover}
      onKeyDown={onKeyDown}
      data-active={active || undefined}
      className={`flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors duration-(--motion-fast) ${
        active ? "bg-accent-subtle text-accent-subtle-foreground" : ""
      }`}
    >
      <span className="flex min-w-0 max-w-full items-center gap-2 text-sm font-medium">
        <Icon
          className={`size-4 shrink-0 ${active ? "" : "text-muted-foreground"}`}
          strokeWidth={1.5}
        />
        <span className="truncate">{title}</span>
      </span>
      {result.matchedField === "content" && result.snippet ? (
        <span className="line-clamp-2 pl-6 text-xs text-muted-foreground">
          {highlight(result.snippet, query)}
        </span>
      ) : null}
      {IS_DEV && result.strategy ? (
        <span className="pl-6 text-[0.6875rem] font-light text-muted-foreground/70">
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
  const [enableKeywordSearch, setEnableKeywordSearch] = useState(true);
  const [enableSemanticSearch, setEnableSemanticSearch] = useState(true);
  const [activeIndex, setActiveIndex] = useState(QUERY_INDEX);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const clearLabel = useShortcutLabel(HOTKEYS.clearSearch);

  const { isLoading, searchNow, reset, results, hasSearched, hasError } = useSearchRequest({
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

  // Keyboard navigation walks the flattened group order, so it always matches
  // what is rendered.
  const groups = useMemo(
    () =>
      GROUP_ORDER.map((key) => ({
        key,
        items: results.filter((r) => r.assetType === key),
      })).filter((g) => g.items.length > 0),
    [results],
  );

  const flatResults = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setActiveIndex(QUERY_INDEX), [results]);

  const goToQuery = useCallback(() => {
    setActiveIndex(QUERY_INDEX);
    inputRef.current?.focus();
  }, []);

  const goToResult = useCallback((index: number) => {
    setActiveIndex(index);
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-result-index="${index}"]`,
    );
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  const clearSearch = useCallback(() => {
    setQuery("");
    setActiveIndex(QUERY_INDEX);
    reset();
    inputRef.current?.focus();
  }, [reset]);

  useHotkey(HOTKEYS.clearSearch, () => clearSearch(), {
    enabled: open,
    allowInInput: true,
  });

  const chipClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-(--motion-fast) ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border text-muted-foreground hover:border-border-strong hover:bg-accent hover:text-foreground"
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

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatResults.length > 0) goToResult(0);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatResults.length > 0) goToResult(flatResults.length - 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      searchNow();
    }
  };

  const handleResultKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (index >= flatResults.length - 1) goToQuery();
      else goToResult(index + 1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (index <= 0) goToQuery();
      else goToResult(index - 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const target = flatResults[index];
      if (target) handleSelect(target);
    }
  };

  const hasResults = results.length > 0;
  const showEmpty = hasSearched && !hasError && !isLoading && !hasResults;
  let runningIndex = -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-[55vw] max-w-[720px] flex-col gap-0 overflow-hidden p-0 [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">Search</DialogTitle>

        <div className="flex shrink-0 items-center gap-2.5 border-b px-3.5">
          <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setActiveIndex(QUERY_INDEX)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search anything…"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          />
          {isLoading ? (
            <Loader2
              className="size-4 shrink-0 animate-spin text-muted-foreground"
              strokeWidth={1.5}
            />
          ) : null}
          {query.length > 0 ? (
            <button
              type="button"
              title="Clear query"
              aria-label="Clear query"
              onClick={clearSearch}
              className="rounded-sm p-0.5 text-muted-foreground transition-colors duration-(--motion-fast) hover:text-foreground"
            >
              <CircleX className="size-4" strokeWidth={1.5} />
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3.5 py-2">
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
          {IS_DEV ? (
            <>
              <span className="mx-1 h-4 w-px bg-border" />
              {STRATEGY_TOGGLES.map(({ key, label }) => {
                const active =
                  key === "keyword" ? enableKeywordSearch : enableSemanticSearch;
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
            </>
          ) : null}
        </div>

        {hasError || showEmpty ? (
          <p className="px-3.5 py-8 text-center text-sm text-muted-foreground">
            {hasError
              ? "Something went wrong. Try again."
              : "No results. Try a different search or remove a filter."}
          </p>
        ) : hasResults ? (
          <div ref={listRef} className="max-h-[min(24rem,55vh)] overflow-y-auto p-1.5">
            {groups.map((group) => (
              <div key={group.key}>
                <div className="sticky top-0 z-10 bg-surface-raised px-2.5 pb-1 pt-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
                  {GROUP_LABELS[group.key]}
                </div>
                {group.items.map((result) => {
                  runningIndex += 1;
                  const index = runningIndex;
                  return (
                    <ResultRow
                      key={`${result.assetType}-${result.assetId}`}
                      result={result}
                      query={query}
                      active={index === activeIndex}
                      index={index}
                      onSelect={handleSelect}
                      onHover={() => setActiveIndex(index)}
                      onKeyDown={(e) => handleResultKeyDown(e, index)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}

        <OverlayFooter
          afterSelect={
            <span className="flex items-center gap-1.5">
              <Kbd className="h-4">{clearLabel}</Kbd>
              clear
            </span>
          }
        >
          {hasResults ? (
            <span className="tabular-nums">
              {results.length} result{results.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </OverlayFooter>
      </DialogContent>
    </Dialog>
  );
}

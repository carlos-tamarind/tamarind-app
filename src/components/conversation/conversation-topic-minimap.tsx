import { useEffect, useMemo, useState, forwardRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CircleX, ListFilter } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listConversationTopics,
  type ConversationTopicView,
} from "@/lib/conversation-topics.functions";

type SortMode = "relevance" | "recency";

function sortTopics(topics: ConversationTopicView[], mode: SortMode) {
  const copy = [...topics];
  if (mode === "recency") {
    copy.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  } else {
    copy.sort((a, b) => b.score - a.score);
  }
  return copy;
}

function filterTopics(topics: ConversationTopicView[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return topics;
  return topics.filter((topic) => {
    const name = topic.name.toLowerCase();
    const description = (topic.description ?? "").toLowerCase();
    return name.includes(q) || description.includes(q);
  });
}

export const ConversationTopicMinimap = forwardRef<
  HTMLDivElement,
  {
    open: boolean;
    conversationId: string;
    onNavigateToMessage: (messageId: string) => void;
  }
>(function ConversationTopicMinimap(
  { open, conversationId, onNavigateToMessage },
  ref,
) {
  const fetchTopics = useServerFn(listConversationTopics);

  const [panelElement, setPanelElement] = useState<HTMLDivElement | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("relevance");
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);

  const { data: topics, isPending, isError } = useQuery({
    queryKey: ["conversation-topics", conversationId],
    queryFn: () => fetchTopics({ data: { conversationId } }),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setExpandedTopicId(null);
      setFilterQuery("");
    }
  }, [open, conversationId]);

  const displayedTopics = useMemo(() => {
    const sorted = sortTopics(topics ?? [], sortMode);
    return filterTopics(sorted, filterQuery);
  }, [topics, sortMode, filterQuery]);

  if (!open) return null;

  const sortLabel =
    sortMode === "relevance"
      ? "More relevant topics first"
      : "More recent topics first";

  return (
    <div
      ref={(node) => {
        setPanelElement(node);
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      className="absolute inset-y-0 right-0 z-30 flex w-[clamp(14rem,33%,22rem)] flex-col border-l bg-surface-raised shadow-md"
      role="dialog"
      aria-label="Semantic map"
    >
      <div className="shrink-0 space-y-2 border-b p-2">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter topics…"
            className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/35"
          />
          {filterQuery.length > 0 ? (
            <button
              type="button"
              title="Clear filter"
              aria-label="Clear filter"
              onClick={() => setFilterQuery("")}
              className="shrink-0 rounded-sm p-1 text-muted-foreground transition-colors duration-(--motion-fast) hover:text-foreground"
            >
              <CircleX className="size-4" strokeWidth={1.5} />
            </button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                aria-label="Sort topics"
                title={sortLabel}
              >
                <ListFilter className="size-4" strokeWidth={1.5} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              container={panelElement}
            >
              <DropdownMenuItem
                onSelect={() => setSortMode("relevance")}
                className={sortMode === "relevance" ? "bg-accent" : ""}
              >
                More relevant topics first
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setSortMode("recency")}
                className={sortMode === "recency" ? "bg-accent" : ""}
              >
                More recent topics first
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
        {isPending ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            Could not load topics.
          </p>
        ) : displayedTopics.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            {topics && topics.length > 0
              ? "No topics match your filter."
              : "No topics identified yet."}
          </p>
        ) : (
          <ul className="space-y-2">
            {displayedTopics.map((topic) => {
              const isExpanded = expandedTopicId === topic.id;
              return (
                <li
                  key={topic.id}
                  className="rounded-lg border bg-background/60 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTopicId((prev) =>
                        prev === topic.id ? null : topic.id,
                      )
                    }
                    className="w-full rounded-lg px-3 py-2.5 text-left transition-colors duration-(--motion-fast) hover:bg-accent/50"
                  >
                    <div className="text-sm font-medium leading-snug break-words">
                      {topic.name}
                    </div>
                    {topic.description ? (
                      <div className="mt-0.5 text-xs leading-snug text-muted-foreground break-words">
                        {topic.description}
                      </div>
                    ) : null}
                  </button>
                  {isExpanded && topic.evidences.length > 0 ? (
                    <div className="border-t px-2 pb-2">
                      {topic.evidences.map((evidence, index) => (
                        <div key={evidence.messageId}>
                          {index > 0 ? <Separator className="my-1" /> : null}
                          <button
                            type="button"
                            onClick={() => onNavigateToMessage(evidence.messageId)}
                            className="w-full rounded-md px-2 py-2 text-left text-xs leading-snug text-foreground transition-colors duration-(--motion-fast) hover:bg-accent/60 break-words"
                          >
                            {evidence.snapshot}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : isExpanded ? (
                    <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                      No evidence messages.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
});

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { FileText, MessageSquare } from "lucide-react";

import { FilterInput } from "@/components/filter-input";
import type { NavConversation, NavPage } from "@/components/navigation-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { getKnowledgeTopicEvidence } from "@/lib/canonical-topics.functions";
import { knowledgeTopicQueryKey } from "@/lib/knowledge-base/query-keys";
import { KNOWLEDGE_TOPIC_NOT_FOUND } from "@/lib/knowledge-base/types";
import { cn } from "@/lib/utils";
import { withKnowledgeEvidence, withTopic } from "@/lib/workspace-search";

type EvidenceRow = {
  key: string;
  kind: "message" | "page";
  title: string;
  snapshot: string;
  createdAt: string;
  active: boolean;
  target:
    | { kind: "conversation"; conversationId: string; messageId: string }
    | { kind: "page"; pageId: string };
};

function formatEvidenceDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : format(date, "d MMM yyyy");
}

type SectionProps = {
  workspaceId: string;
  conversations: NavConversation[];
  pages: NavPage[];
  activeConversationId?: string;
  activePageId?: string;
};

export function KnowledgeNavSection({
  selectedTopicId,
  ...props
}: SectionProps & { selectedTopicId?: string }) {
  if (!selectedTopicId) {
    return (
      <p className="px-2 py-2 text-sm text-muted-foreground">
        Select a node in the graph to see the evidence behind it.
      </p>
    );
  }
  // Keyed so the evidence filter starts empty for every newly selected topic.
  return <TopicEvidence key={selectedTopicId} topicId={selectedTopicId} {...props} />;
}

function TopicEvidence({
  workspaceId,
  topicId,
  conversations,
  pages,
  activeConversationId,
  activePageId,
}: SectionProps & { topicId: string }) {
  const navigate = useNavigate();
  const fetchEvidence = useServerFn(getKnowledgeTopicEvidence);
  const [query, setQuery] = useState("");

  const { data, isPending, error } = useQuery({
    queryKey: knowledgeTopicQueryKey(workspaceId, topicId),
    queryFn: () => fetchEvidence({ data: { workspaceId, canonicalTopicId: topicId } }),
    retry: (count, err) => err?.message !== KNOWLEDGE_TOPIC_NOT_FOUND && count < 2,
  });

  // Hidden and deleted topics answer the same way; either way, drop the selection.
  useEffect(() => {
    if (error?.message !== KNOWLEDGE_TOPIC_NOT_FOUND) return;
    void navigate({
      to: "/w/$workspaceId",
      params: { workspaceId },
      search: (prev) => withTopic(prev, undefined),
      replace: true,
    });
  }, [error, navigate, workspaceId]);

  const rows = useMemo((): EvidenceRow[] => {
    if (!data) return [];
    const conversationTitles = new Map(conversations.map((c) => [c.id, c.title]));
    const pageTitles = new Map(pages.map((p) => [p.id, p.title || "Untitled"]));
    const out: EvidenceRow[] = [];
    for (const item of data.items) {
      if (item.kind === "message") {
        const title = conversationTitles.get(item.conversationId);
        if (title === undefined) continue;
        out.push({
          key: `m:${item.messageId}`,
          kind: "message",
          title,
          snapshot: item.snapshot,
          createdAt: item.createdAt,
          active: activeConversationId === item.conversationId,
          target: {
            kind: "conversation",
            conversationId: item.conversationId,
            messageId: item.messageId,
          },
        });
      } else {
        const title = pageTitles.get(item.pageId);
        if (title === undefined) continue;
        out.push({
          key: `p:${item.pageId}`,
          kind: "page",
          title,
          snapshot: item.snapshot,
          createdAt: item.createdAt,
          active: activePageId === item.pageId,
          target: { kind: "page", pageId: item.pageId },
        });
      }
    }
    return out;
  }, [data, conversations, pages, activeConversationId, activePageId]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = normalizedQuery
    ? rows.filter(
        (row) =>
          row.title.toLowerCase().includes(normalizedQuery) ||
          row.snapshot.toLowerCase().includes(normalizedQuery),
      )
    : rows;

  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-10 space-y-2 bg-surface px-1.5 pb-2 pt-2">
        {data ? (
          <h2 className="break-words px-0.5 text-sm font-bold leading-snug text-foreground">
            {data.topic.name}
          </h2>
        ) : (
          <Skeleton className="h-5 w-3/4" />
        )}
        <FilterInput
          value={query}
          onChange={setQuery}
          placeholder="Filter evidence…"
          inputClassName="h-7 px-2 text-sm"
        />
      </div>

      <div className="space-y-1.5 px-1.5 pb-2">
        {isPending ? (
          <>
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </>
        ) : error ? (
          error.message === KNOWLEDGE_TOPIC_NOT_FOUND ? null : (
            <p className="px-0.5 py-1 text-sm text-muted-foreground">
              Couldn't load the evidence for this topic.
            </p>
          )
        ) : visibleRows.length === 0 ? (
          <p className="px-0.5 py-1 text-sm text-muted-foreground">
            {normalizedQuery ? "No matching evidence." : "No evidence to show."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {visibleRows.map((row) => {
              const Icon = row.kind === "message" ? MessageSquare : FileText;
              return (
                <li key={row.key}>
                  <Link
                    to="/w/$workspaceId"
                    params={{ workspaceId }}
                    search={(prev) => withKnowledgeEvidence(prev, row.target)}
                    className={cn(
                      "block rounded-lg border bg-background p-2 transition-colors duration-(--motion-fast) hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
                      row.active && "border-primary/50 bg-accent-subtle",
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-xs">
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {row.title}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground/80">
                        {formatEvidenceDate(row.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-3 break-words text-xs leading-relaxed text-muted-foreground">
                      {row.snapshot}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

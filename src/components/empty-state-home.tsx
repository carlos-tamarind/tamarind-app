import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  FileLock,
  FilePlusCorner,
  FileText,
  MessageSquareLock,
  MessageSquarePlus,
  Search,
  User as UserIcon,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Wordmark } from "@/components/brand/wordmark";
import { Skeleton } from "@/components/ui/skeleton";
import { listRecentActivity, type RecentActivityItem } from "@/lib/activity.functions";
import { HOTKEYS, useShortcutLabel } from "@/hooks/use-hotkeys";

function itemIcon(item: RecentActivityItem) {
  if (item.kind === "conversation") {
    return item.subtype === "group" || item.subtype === "channel" ? Users : UserIcon;
  }
  if (item.subtype === "private") return FileLock;
  if (item.subtype === "conversation") return MessageSquareLock;
  if (item.subtype === "workspace") return Building2;
  return FileText;
}

function RecentItemRow({
  item,
  workspaceId,
}: {
  item: RecentActivityItem;
  workspaceId: string;
}) {
  const Icon = itemIcon(item);
  return (
    <li>
      <Link
        to="/w/$workspaceId"
        params={{ workspaceId }}
        search={(prev: any) =>
          item.kind === "conversation"
            ? { ...prev, c: item.id }
            : { ...prev, p: item.id }
        }
        className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors duration-(--motion-fast) hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        <span className="truncate">{item.title}</span>
      </Link>
    </li>
  );
}

function CreateActions({
  onNewConversation,
  onNewPage,
}: {
  onNewConversation: () => void;
  onNewPage: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button variant="secondary" onClick={onNewConversation}>
        <MessageSquarePlus className="size-4" />
        New conversation
      </Button>
      <Button variant="secondary" onClick={onNewPage}>
        <FilePlusCorner className="size-4" />
        New page
      </Button>
    </div>
  );
}

export function EmptyStateHome({
  workspaceId,
  onNewConversation,
  onNewPage,
  onOpenSearch,
}: {
  workspaceId: string;
  onNewConversation: () => void;
  onNewPage: () => void;
  onOpenSearch: () => void;
}) {
  const fetchRecent = useServerFn(listRecentActivity);
  const searchLabel = useShortcutLabel(HOTKEYS.search);

  const { data: recent, isPending } = useQuery({
    queryKey: ["recent-activity", workspaceId],
    queryFn: () => fetchRecent({ data: { workspaceId, limit: 4 } }),
    staleTime: 30_000,
  });

  const hasRecent = !isPending && !!recent && recent.length > 0;

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <h2 className="text-center text-2xl font-semibold tracking-[-0.02em]">
          Welcome to <Wordmark />
        </h2>

        {isPending ? (
          <div className="mt-8 space-y-3" aria-hidden="true">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="mx-auto mt-4 h-8 w-72" />
          </div>
        ) : hasRecent ? (
          <div className="mt-8 rounded-xl border bg-surface p-3">
            <h3 className="px-2.5 pb-1.5 pt-1 text-base font-semibold tracking-[-0.01em] text-foreground">
              Pick up where you left:
            </h3>
            <ul className="space-y-0.5">
              {recent!.map((item) => (
                <RecentItemRow
                  key={`${item.kind}-${item.id}`}
                  item={item}
                  workspaceId={workspaceId}
                />
              ))}
            </ul>
          </div>
        ) : (
          <>
            <h3 className="mt-3 text-center text-sm text-muted-foreground">
              Build, collaborate, and never lose context again
            </h3>

            <button
              type="button"
              onClick={onOpenSearch}
              className="mt-8 flex h-10 w-full items-center gap-2.5 rounded-lg border bg-surface px-3 text-sm text-muted-foreground shadow-xs transition-colors duration-(--motion-fast) hover:border-border-strong hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
            >
              <Search className="size-4 shrink-0" strokeWidth={1.5} />
              <span>Search anything</span>
              <Kbd className="ml-auto">{searchLabel}</Kbd>
            </button>

            <p className="my-3 text-center text-xs text-muted-foreground">or</p>
          </>
        )}

        {!isPending ? (
          <div className={hasRecent ? "mt-6" : undefined}>
            <CreateActions
              onNewConversation={onNewConversation}
              onNewPage={onNewPage}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

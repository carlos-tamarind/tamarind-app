import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, FileLock, Loader2, MessageSquareLock } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { appendMessagesToPage } from "@/lib/conversations.functions";
import { listMyPages } from "@/lib/pages.functions";

function VisibilityIcon({
  visibility,
}: {
  visibility: "private" | "workspace" | "conversation" | "external";
}) {
  const Icon =
    visibility === "private"
      ? FileLock
      : visibility === "workspace"
        ? Building2
        : visibility === "conversation"
          ? MessageSquareLock
          : FileLock;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />;
}

export function AddMessagesToPageDialog({
  open,
  onOpenChange,
  workspaceId,
  conversationId,
  messageIds,
  onAppended,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  conversationId: string;
  messageIds: string[];
  onAppended: (pageId: string) => void;
}) {
  const queryClient = useQueryClient();
  const fetchPages = useServerFn(listMyPages);
  const appendToPage = useServerFn(appendMessagesToPage);

  const [filter, setFilter] = useState("");
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setFilter("");
      setSelectedPageId(null);
      setSubmitting(false);
    }
  }, [open]);

  const { data: pages, isLoading } = useQuery({
    queryKey: ["pages-list", workspaceId],
    queryFn: () => fetchPages({ data: { workspaceId } }),
    enabled: open,
  });

  const livePages = useMemo(
    () => (pages ?? []).filter((p) => !p.purgedAt),
    [pages],
  );

  const filteredPages = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return livePages;
    return livePages.filter((p) =>
      (p.title || "Untitled").toLowerCase().includes(q),
    );
  }, [livePages, filter]);

  const canConfirm =
    !!selectedPageId && messageIds.length > 0 && !submitting;

  const handleConfirm = async () => {
    if (!selectedPageId || messageIds.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const res = await appendToPage({
        data: {
          conversationId,
          pageId: selectedPageId,
          messageIds,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["page", selectedPageId] }),
        queryClient.invalidateQueries({ queryKey: ["pages-list", workspaceId] }),
      ]);
      onOpenChange(false);
      onAppended(res.pageId);
    } catch {
      toast.error("Could not add messages to the page. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="detail">
        <DialogHeader>
          <DialogTitle>Add messages to page</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="add-to-page-filter" className="text-sm font-normal">
            Select the page where you want to append the selected messages:
          </Label>
          <div className="overflow-hidden rounded-md border bg-muted/30">
            <div className="border-b p-2">
              <Input
                id="add-to-page-filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter…"
                autoFocus
              />
            </div>
            <ul className="max-h-72 overflow-y-auto p-1">
              {isLoading ? (
                <li className="px-2 py-3 text-sm text-muted-foreground">
                  Loading pages…
                </li>
              ) : filteredPages.length === 0 ? (
                <li className="px-2 py-3 text-sm text-muted-foreground">
                  {livePages.length === 0
                    ? "No pages yet."
                    : "No pages match this filter."}
                </li>
              ) : (
                filteredPages.map((page) => {
                  const selected = page.id === selectedPageId;
                  return (
                    <li key={page.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedPageId(page.id)}
                        className={cn(
                          "flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                          selected
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent/60",
                        )}
                      >
                        <VisibilityIcon visibility={page.visibility} />
                        <span className="min-w-0 flex-1 whitespace-normal break-words">
                          {page.title || "Untitled"}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={!canConfirm}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MessageSquarePlus, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth-context";
import {
  listWorkspaceMembers,
  findOrCreateConversation,
} from "@/lib/conversations.functions";
import { createBlankPage } from "@/lib/pages.functions";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/")({
  component: WorkspaceIndex,
});

function WorkspaceIndex() {
  const { workspaceId } = useParams({ from: "/_authenticated/w/$workspaceId/" });
  const navigate = useNavigate();
  const { user } = useAuth();

  const [convOpen, setConvOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [creatingPage, setCreatingPage] = useState(false);

  const fetchMembers = useServerFn(listWorkspaceMembers);
  const findOrCreate = useServerFn(findOrCreateConversation);
  const newPage = useServerFn(createBlankPage);

  const { data: members } = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => fetchMembers({ data: { workspaceId } }),
    enabled: convOpen,
  });

  const others = (members ?? []).filter((m) => m.userId !== user?.id);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCloseConv = () => {
    setConvOpen(false);
    setSelected(new Set());
  };

  const handleCreateConv = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    try {
      const { conversationId } = await findOrCreate({
        data: {
          workspaceId,
          participantWorkspaceUserIds: Array.from(selected),
        },
      });
      handleCloseConv();
      navigate({
        to: "/w/$workspaceId/c/$conversationId",
        params: { workspaceId, conversationId },
      });
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handleNewPage = async () => {
    if (creatingPage) return;
    setCreatingPage(true);
    try {
      const { pageId } = await newPage({ data: { workspaceId } });
      navigate({
        to: "/w/$workspaceId/p/$pageId",
        params: { workspaceId, pageId },
      });
    } catch (e) {
      console.error(e);
      setCreatingPage(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <p className="max-w-md text-base text-muted-foreground">
        Pick a conversation or page from the sidebar to get started, or create a new one:
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button variant="secondary" onClick={() => setConvOpen(true)}>
          <MessageSquarePlus className="size-4" />
          New conversation
        </Button>
        <Button variant="secondary" onClick={handleNewPage} disabled={creatingPage}>
          {creatingPage ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
          New page
        </Button>
      </div>

      <Dialog open={convOpen} onOpenChange={(o) => (o ? setConvOpen(true) : handleCloseConv())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New conversation</DialogTitle>
            <DialogDescription>
              Select one or more members to start a conversation with.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 overflow-y-auto">
            {others.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No other members in this workspace yet.
              </p>
            ) : (
              <ul className="divide-y">
                {others.map((m) => {
                  const checked = selected.has(m.workspaceUserId);
                  return (
                    <li key={m.workspaceUserId}>
                      <label className="flex cursor-pointer items-center gap-3 px-1 py-2 hover:bg-accent/40">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(m.workspaceUserId)}
                        />
                        <span className="text-sm">
                          {m.displayName ?? m.userId.slice(0, 8)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={handleCreateConv}
              disabled={selected.size === 0 || busy}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Create chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

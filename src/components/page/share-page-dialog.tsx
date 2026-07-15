import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/lib/auth-context";
import {
  listWorkspaceMembers,
  listMyConversations,
} from "@/lib/conversations.functions";
import { sharePage } from "@/lib/pages.functions";

export function SharePageDialog({
  open,
  onOpenChange,
  pageId,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  workspaceId: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fetchMembers = useServerFn(listWorkspaceMembers);
  const fetchConversations = useServerFn(listMyConversations);
  const doShare = useServerFn(sharePage);

  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedConvs, setSelectedConvs] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: members } = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => fetchMembers({ data: { workspaceId } }),
    enabled: open,
  });

  const { data: conversations } = useQuery({
    queryKey: ["conversations-list", workspaceId],
    queryFn: () => fetchConversations({ data: { workspaceId } }),
    enabled: open,
  });

  const otherMembers = useMemo(
    () => (members ?? []).filter((m) => m.userId !== user?.id),
    [members, user?.id],
  );
  const groupConvs = useMemo(
    () => (conversations ?? []).filter((c) => c.type === "group"),
    [conversations],
  );

  const totalSelected = selectedUsers.size + selectedConvs.size;

  const resetAndClose = () => {
    setSelectedUsers(new Set());
    setSelectedConvs(new Set());
    setConfirmOpen(false);
    onOpenChange(false);
  };

  const toggleUser = (id: string) =>
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleConv = (id: string) =>
    setSelectedConvs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedUserLabels = otherMembers
    .filter((m) => selectedUsers.has(m.workspaceUserId))
    .map((m) => m.label);
  const selectedConvLabels = groupConvs
    .filter((c) => selectedConvs.has(c.id))
    .map((c) => c.title);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await doShare({
        data: {
          pageId,
          workspaceUserIds: Array.from(selectedUsers),
          conversationIds: Array.from(selectedConvs),
        },
      });
      toast.success("Page shared");
      queryClient.invalidateQueries({ queryKey: ["page", pageId] });
      queryClient.invalidateQueries({ queryKey: ["pages-list", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["conversations-list", workspaceId] });
      for (const cid of res.conversationIds ?? []) {
        queryClient.invalidateQueries({ queryKey: ["conversation-messages", cid] });
        queryClient.invalidateQueries({ queryKey: ["conversation-pages", cid] });
      }
      resetAndClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not share page");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) resetAndClose();
          else onOpenChange(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share page</DialogTitle>
            <DialogDescription>
              Share this page with specific users or entire group conversations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent/40">
                Share with specific users:
                <ChevronDown className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 max-h-56 overflow-y-auto rounded-md border">
                {otherMembers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No other members in this workspace.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {otherMembers.map((m) => (
                      <li key={m.workspaceUserId}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent/40">
                          <Checkbox
                            checked={selectedUsers.has(m.workspaceUserId)}
                            onCheckedChange={() => toggleUser(m.workspaceUserId)}
                          />
                          <span className="text-sm">{m.label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </CollapsibleContent>
            </Collapsible>

            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent/40">
                Share with entire group conversations:
                <ChevronDown className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 max-h-56 overflow-y-auto rounded-md border">
                {groupConvs.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    You have no group conversations.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {groupConvs.map((c) => (
                      <li key={c.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent/40">
                          <Checkbox
                            checked={selectedConvs.has(c.id)}
                            onCheckedChange={() => toggleConv(c.id)}
                          />
                          <span className="text-sm">{c.title}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button variant="secondary" onClick={resetAndClose}>
              Cancel
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={totalSelected === 0}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!o) setConfirmOpen(false);
          else setConfirmOpen(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share page</DialogTitle>
            <DialogDescription>
              Are you sure you want to share this page with the selected users?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            {selectedUserLabels.length > 0 && (
              <div>
                <span className="font-medium">Users: </span>
                <span className="text-muted-foreground">
                  {selectedUserLabels.join(", ")}
                </span>
              </div>
            )}
            {selectedConvLabels.length > 0 && (
              <div>
                <span className="font-medium">Conversations: </span>
                <span className="text-muted-foreground">
                  {selectedConvLabels.join(", ")}
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

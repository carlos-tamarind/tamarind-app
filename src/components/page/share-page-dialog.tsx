import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
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
import { MemberPickerList } from "@/components/member-picker-list";
import { useAuth } from "@/lib/auth-context";
import { listWorkspaceMembers, listMyConversations } from "@/lib/conversations.functions";
import { sharePage } from "@/lib/pages.functions";

function participantLabel(n: number) {
  return `${n} participant${n === 1 ? "" : "s"}`;
}

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

  const pickerItems = useMemo(
    () =>
      [
        ...otherMembers.map((m) => ({
          id: `user:${m.workspaceUserId}`,
          label: m.label,
          avatarUrl: m.avatarUrl,
          checked: selectedUsers.has(m.workspaceUserId),
          onToggle: () => toggleUser(m.workspaceUserId),
        })),
        ...groupConvs.map((c) => ({
          id: `conv:${c.id}`,
          label: c.title,
          avatarUrl: c.avatarUrl,
          sublabel: participantLabel(c.participantCount ?? 0),
          checked: selectedConvs.has(c.id),
          onToggle: () => toggleConv(c.id),
        })),
      ].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    [otherMembers, groupConvs, selectedUsers, selectedConvs],
  );

  const selectedUserLabels = otherMembers
    .filter((m) => selectedUsers.has(m.workspaceUserId))
    .map((m) => m.label);
  const selectedConvLabels = groupConvs.filter((c) => selectedConvs.has(c.id)).map((c) => c.title);

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
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Share page</DialogTitle>
            <DialogDescription>
              Share this page with specific users or entire group conversations.
            </DialogDescription>
          </DialogHeader>

          <MemberPickerList
            key={open ? "open" : "closed"}
            items={pickerItems}
            emptyMessage="No other members available."
            noMatchMessage="No matching conversations."
            maxHeightClass="max-h-56"
          />

          <DialogFooter className="sm:justify-between">
            <Button variant="secondary" onClick={resetAndClose}>
              Cancel
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={totalSelected === 0}>
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
        <DialogContent size="sm">
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
                <span className="text-muted-foreground">{selectedUserLabels.join(", ")}</span>
              </div>
            )}
            {selectedConvLabels.length > 0 && (
              <div>
                <span className="font-medium">Conversations: </span>
                <span className="text-muted-foreground">{selectedConvLabels.join(", ")}</span>
              </div>
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={busy}>
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

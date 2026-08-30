import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Loader2, FileLock, MessageSquareLock } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { MemberPickerList } from "@/components/member-picker-list";
import { useAuth } from "@/lib/auth-context";
import { listWorkspaceMembers, listMyConversations } from "@/lib/conversations.functions";
import { duplicatePage } from "@/lib/pages.functions";
import { withPage } from "@/lib/workspace-search";

type Visibility = "private" | "workspace" | "conversation";

function participantLabel(n: number) {
  return `${n} participant${n === 1 ? "" : "s"}`;
}

export function DuplicatePageDialog({
  open,
  onOpenChange,
  pageId,
  workspaceId,
  currentTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  workspaceId: string;
  currentTitle: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchMembers = useServerFn(listWorkspaceMembers);
  const fetchConversations = useServerFn(listMyConversations);
  const doDuplicate = useServerFn(duplicatePage);

  const placeholder = `${currentTitle || "Untitled"} (duplicate)`;

  const [titleInput, setTitleInput] = useState("");
  const [visibility, setVisibility] = useState<Visibility | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedConvs, setSelectedConvs] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset when re-opened
  useEffect(() => {
    if (open) {
      setTitleInput("");
      setVisibility(null);
      setSelectedUsers(new Set());
      setSelectedConvs(new Set());
      setConfirmOpen(false);
      setBusy(false);
    }
  }, [open]);

  const { data: members } = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => fetchMembers({ data: { workspaceId } }),
    enabled: open && visibility === "conversation",
  });

  const { data: conversations } = useQuery({
    queryKey: ["conversations-list", workspaceId],
    queryFn: () => fetchConversations({ data: { workspaceId } }),
    enabled: open && visibility === "conversation",
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

  const canContinue = visibility !== null && (visibility !== "conversation" || totalSelected > 0);

  const resetAndClose = () => {
    setTitleInput("");
    setVisibility(null);
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
  const selectedConvLabels = groupConvs.filter((c) => selectedConvs.has(c.id)).map((c) => c.title);

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

  const finalTitle = titleInput.trim() || placeholder;

  const handleConfirm = async () => {
    if (busy || !visibility) return;
    setBusy(true);
    try {
      const res = await doDuplicate({
        data: {
          pageId,
          title: finalTitle,
          visibility,
          workspaceUserIds: visibility === "conversation" ? Array.from(selectedUsers) : [],
          conversationIds: visibility === "conversation" ? Array.from(selectedConvs) : [],
        },
      });
      toast.success("Page duplicated");
      queryClient.invalidateQueries({ queryKey: ["pages-list", workspaceId] });
      for (const cid of res.conversationIds ?? []) {
        queryClient.invalidateQueries({ queryKey: ["conversation-messages", cid] });
        queryClient.invalidateQueries({ queryKey: ["conversation-pages", cid] });
      }
      queryClient.invalidateQueries({ queryKey: ["conversations-list", workspaceId] });
      resetAndClose();
      navigate({
        to: "/w/$workspaceId",
        params: { workspaceId },
        search: (prev) => withPage(prev, res.pageId),
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not duplicate page");
    } finally {
      setBusy(false);
    }
  };

  const VisibilityButton = ({
    value,
    label,
    Icon,
  }: {
    value: Visibility;
    label: string;
    Icon: typeof FileLock;
  }) => (
    <Button
      type="button"
      variant={visibility === value ? "default" : "outline"}
      className="min-w-0 flex-1 gap-2"
      onClick={() => setVisibility(value)}
    >
      <Icon className="size-4" />
      {label}
    </Button>
  );

  const confirmText =
    visibility === "private"
      ? "Are you sure you want to create a copy of this page?"
      : visibility === "workspace"
        ? "Are you sure you want to publish a copy of this page with the whole workspace?"
        : "Are you sure you want to share a copy of this page with the selected users?";

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
            <DialogTitle>Duplicate page</DialogTitle>
            <DialogDescription>Create an independent copy of this page.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Rename</div>
              <Input
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder={placeholder}
                maxLength={500}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Visibility</div>
              <div className="flex min-w-0 gap-2">
                <VisibilityButton value="private" label="Private" Icon={FileLock} />
                <VisibilityButton
                  value="conversation"
                  label="Conversation"
                  Icon={MessageSquareLock}
                />
                <VisibilityButton value="workspace" label="Workspace" Icon={Building2} />
              </div>
            </div>

            {visibility === "conversation" && (
              <MemberPickerList
                key={open ? "open" : "closed"}
                items={pickerItems}
                emptyMessage="No other members available."
                noMatchMessage="No matching conversations."
                maxHeightClass="max-h-56"
              />
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            <Button variant="secondary" onClick={resetAndClose}>
              Cancel
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={!canContinue}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={(o) => setConfirmOpen(o)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Duplicate page</DialogTitle>
            <DialogDescription>{confirmText}</DialogDescription>
          </DialogHeader>

          {visibility === "conversation" && (
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
          )}

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

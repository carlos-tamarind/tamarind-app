import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MemberPickerRow } from "@/components/member-picker-row";
import { useAuth } from "@/lib/auth-context";
import {
  listWorkspaceMembers,
  findOrCreateConversation,
} from "@/lib/conversations.functions";

export function NewConversationDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchMembers = useServerFn(listWorkspaceMembers);
  const findOrCreate = useServerFn(findOrCreateConversation);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const { data: members } = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => fetchMembers({ data: { workspaceId } }),
    enabled: open,
  });

  const others = (members ?? []).filter((m) => m.userId !== user?.id);

  const close = () => {
    onOpenChange(false);
    setSelected(new Set());
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCreate = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    try {
      const { conversationId } = await findOrCreate({
        data: {
          workspaceId,
          participantWorkspaceUserIds: Array.from(selected),
        },
      });
      queryClient.invalidateQueries({ queryKey: ["conversations-list", workspaceId] });
      close();
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

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>
            Select one or more members to start a conversation with.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 max-h-72 overflow-y-auto px-1">
          {others.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No other members in this workspace yet.
            </p>
          ) : (
            <ul>
              {others.map((m) => (
                <li key={m.workspaceUserId}>
                  <MemberPickerRow
                    label={m.label}
                    avatarUrl={m.avatarUrl}
                    checked={selected.has(m.workspaceUserId)}
                    onToggle={() => toggle(m.workspaceUserId)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={selected.size === 0 || busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Create chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

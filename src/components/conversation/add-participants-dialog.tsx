import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  listWorkspaceMembers,
  addParticipants,
} from "@/lib/conversations.functions";

export function AddParticipantsDialog({
  workspaceId,
  conversationId,
  existingWorkspaceUserIds,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  conversationId: string;
  existingWorkspaceUserIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fetchMembers = useServerFn(listWorkspaceMembers);
  const addPart = useServerFn(addParticipants);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const { data: members } = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => fetchMembers({ data: { workspaceId } }),
    enabled: open,
  });

  const existingSet = new Set(existingWorkspaceUserIds);
  const candidates = (members ?? []).filter((m) => !existingSet.has(m.workspaceUserId));

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

  const handleAdd = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    try {
      await addPart({
        data: { conversationId, workspaceUserIds: Array.from(selected) },
      });
      queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations-list", workspaceId] });
      close();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add participants</DialogTitle>
          <DialogDescription>
            Select workspace members to add to this conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No other members available.
            </p>
          ) : (
            <ul className="divide-y">
              {candidates.map((m) => {
                const checked = selected.has(m.workspaceUserId);
                return (
                  <li key={m.workspaceUserId}>
                    <label className="flex cursor-pointer items-center gap-3 px-1 py-2 hover:bg-accent/40">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(m.workspaceUserId)}
                      />
                      <span className="text-sm">
                        {m.label}
                      </span>

                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={selected.size === 0 || busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { FilePlus, UserPlus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { listConversationPages } from "@/lib/conversations.functions";
import { AddParticipantsDialog } from "./add-participants-dialog";
import { EditableTitle } from "./editable-title";
import { NewPageDialog } from "@/components/page/new-page-dialog";

type Participant = {
  workspaceUserId: string;
  displayName: string;
  isMe: boolean;
};

export function ConversationSettingsDialog({
  workspaceId,
  conversationId,
  title,
  isGroup,
  participants,
  open,
  onOpenChange,
  onRename,
}: {
  workspaceId: string;
  conversationId: string;
  title: string;
  isGroup: boolean;
  participants: Participant[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (title: string) => Promise<void>;
}) {
  const navigate = useNavigate();
  const fetchPages = useServerFn(listConversationPages);
  const [addOpen, setAddOpen] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);

  const { data: pages } = useQuery({
    queryKey: ["conversation-pages", conversationId],
    queryFn: () => fetchPages({ data: { conversationId } }),
    enabled: open,
  });

  const initials = title
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleNewPage = () => setNewPageOpen(true);
  const handlePageCreated = (pageId: string) => {
    onOpenChange(false);
    navigate({
      to: "/w/$workspaceId",
      params: { workspaceId },
      search: (prev: any) => ({ ...prev, p: pageId }),
    });
  };

  const handleOpenPage = (pageId: string) => {
    onOpenChange(false);
    navigate({
      to: "/w/$workspaceId",
      params: { workspaceId },
      search: (prev: any) => ({ ...prev, p: pageId }),
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conversation settings</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-2 py-2">
            <div className="flex size-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
              {initials || "C"}
            </div>
            <div className="w-full px-6">
              <EditableTitle
                value={title}
                editable={isGroup}
                onSave={onRename}
                className="justify-center text-base font-medium"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Participants</h3>
              <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)}>
                <UserPlus className="size-3.5" /> Add
              </Button>
            </div>
            <ul className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-2 text-sm">
              {participants.map((p) => (
                <li key={p.workspaceUserId} className="px-1 py-1">
                  {p.displayName}
                  {p.isMe && (
                    <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Pages</h3>
              <Button size="sm" variant="ghost" onClick={handleNewPage}>
                <FilePlus className="size-3.5" /> New page
              </Button>
            </div>
            <ul className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-2 text-sm">
              {(pages ?? []).length === 0 ? (
                <li className="px-1 py-1 text-muted-foreground">No pages yet.</li>
              ) : (
                (pages ?? []).map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => handleOpenPage(p.id)}
                      className="block w-full truncate rounded px-1 py-1 text-left hover:bg-accent"
                    >
                      {p.title || "Untitled"}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </DialogContent>
      </Dialog>

      <AddParticipantsDialog
        workspaceId={workspaceId}
        conversationId={conversationId}
        existingWorkspaceUserIds={participants.map((p) => p.workspaceUserId)}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
      <NewPageDialog
        workspaceId={workspaceId}
        conversationId={conversationId}
        open={newPageOpen}
        onOpenChange={setNewPageOpen}
        onCreated={handlePageCreated}
      />
    </TooltipProvider>
  );
}

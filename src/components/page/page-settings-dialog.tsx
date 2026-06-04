import { Lock, Globe, MessageSquare } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type Collaborator = {
  workspaceUserId: string;
  displayName: string;
  lastEditedAt: string;
};

export type PageVisibility = "private" | "workspace" | "conversation" | "external";

export function PageSettingsDialog({
  open,
  onOpenChange,
  title,
  onTitleChange,
  onTitleCommit,
  ownerDisplayName,
  visibility,
  onVisibilityChange,
  collaborators,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onTitleChange: (value: string) => void;
  onTitleCommit: () => void;
  ownerDisplayName: string | null;
  visibility: PageVisibility;
  onVisibilityChange: (value: "private" | "workspace") => void;
  collaborators: Collaborator[];
}) {
  const selectValue =
    visibility === "workspace" ? "workspace" : "private";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Page settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              onBlur={onTitleCommit}
              placeholder="Untitled"
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground">
              Owner
            </div>
            <div className="text-sm">{ownerDisplayName ?? "—"}</div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Who can see this page?
            </label>
            {visibility === "conversation" ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <MessageSquare className="size-3.5" /> Conversation participants
              </div>
            ) : (
              <Select
                value={selectValue}
                onValueChange={(v) =>
                  onVisibilityChange(v as "private" | "workspace")
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">
                    <span className="flex items-center gap-2">
                      <Lock className="size-3.5" /> Private
                    </span>
                  </SelectItem>
                  <SelectItem value="workspace">
                    <span className="flex items-center gap-2">
                      <Globe className="size-3.5" /> Workspace
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground">
              Collaborators
            </div>
            <ul className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-2 text-sm">
              {collaborators.length === 0 ? (
                <li className="px-1 py-1 text-muted-foreground">
                  No collaborators yet.
                </li>
              ) : (
                collaborators.map((c) => (
                  <li key={c.workspaceUserId} className="px-1 py-1">
                    {c.displayName}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

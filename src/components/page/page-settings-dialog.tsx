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
  pageId,
  title,
  onTitleChange,
  onTitleCommit,
  ownerDisplayName,
  visibility,
  isOwner,
  onVisibilityChange,
  collaborators,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  title: string;
  onTitleChange: (value: string) => void;
  onTitleCommit: () => void;
  ownerDisplayName: string | null;
  visibility: PageVisibility;
  isOwner: boolean;
  onVisibilityChange: (value: "private" | "workspace") => void;
  collaborators: Collaborator[];
}) {
  const selectValue: PageVisibility = visibility;

  // Enable rules:
  // - private + owner: can promote to workspace
  // - everything else: locked
  const canPromoteToWorkspace = visibility === "private" && isOwner;

  const privateDisabled = visibility !== "private";
  const workspaceDisabled = !(visibility === "workspace" || canPromoteToWorkspace);
  const conversationDisabled = visibility !== "conversation";

  const helperText =
    visibility === "workspace"
      ? "Visibility on Workspace pages cannot be changed back. Duplicate to make a private copy."
      : visibility === "conversation"
        ? "Visibility on Conversation pages cannot be changed. Duplicate to make a private copy."
        : null;

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
              Page ID
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
              {pageId}
            </div>
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
            <Select
              value={selectValue}
              onValueChange={(v) => {
                if (v === "private" || v === "workspace") {
                  onVisibilityChange(v);
                }
              }}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private" disabled={privateDisabled}>
                  <span className="flex items-center gap-2">
                    <Lock className="size-3.5" /> Private
                  </span>
                </SelectItem>
                <SelectItem value="workspace" disabled={workspaceDisabled}>
                  <span className="flex items-center gap-2">
                    <Globe className="size-3.5" /> Workspace
                  </span>
                </SelectItem>
                <SelectItem value="conversation" disabled={conversationDisabled}>
                  <span className="flex items-center gap-2">
                    <MessageSquare className="size-3.5" /> Conversation
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {helperText && (
              <p className="text-xs text-muted-foreground">{helperText}</p>
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

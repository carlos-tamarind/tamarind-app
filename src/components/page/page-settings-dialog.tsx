import { FileLock, Building2, MessageSquareLock } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  collaborators,
  onPublish,
  onShare,
  onDuplicate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  title: string;
  onTitleChange: (value: string) => void;
  onTitleCommit: () => void;
  ownerDisplayName: string | null;
  visibility: PageVisibility;
  isOwner?: boolean;
  collaborators: Collaborator[];
  onPublish: () => void;
  onShare: () => void;
  onDuplicate: () => void;
}) {
  const visibilityLabel =
    visibility === "private" ? (
      <>
        <FileLock className="size-3.5" /> Only you can access this page.
      </>
    ) : visibility === "conversation" ? (
      <>
        <MessageSquareLock className="size-3.5" /> You and all collaborators can access this page.
      </>
    ) : (
      <>
        <Building2 className="size-3.5" /> All members from this workspace can access this page.
      </>
    );

  const showCollaborators = visibility === "conversation" || visibility === "external";
  const showPublish = visibility === "private";
  const showShare = visibility !== "workspace";

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
            <div className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground break-all">
              {pageId}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground">
              Owner
            </div>
            <div className="text-sm break-words">{ownerDisplayName ?? "—"}</div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground">
              Who can see this page?
            </div>
            <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground [&>svg]:shrink-0">
              {visibilityLabel}
            </div>
          </div>

          {showCollaborators && (
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
                    <li key={c.workspaceUserId} className="min-w-0 break-words px-1 py-1">
                      {c.displayName}
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          {showPublish && (
            <Button variant="secondary" className="flex-1" onClick={onPublish}>
              <Building2 className="size-3.5" /> Publish
            </Button>
          )}
          {showShare && (
            <Button variant="secondary" className="flex-1" onClick={onShare}>
              <MessageSquareLock className="size-3.5" /> Share
            </Button>
          )}
          <Button variant="secondary" className="flex-1" onClick={onDuplicate}>
            Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

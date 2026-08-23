import { FileLock, Building2, MessageSquareLock, MessageSquareShare, Copy, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserLink } from "@/components/user-link";
import { PinToggle } from "@/components/pin-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageDeletionBanner } from "@/components/page/page-deletion-banner";
import { isTrashed } from "@/lib/delete-entities/config";

type Collaborator = {
  workspaceUserId: string;
  displayName: string;
  lastEditedAt: string;
};

export type PageVisibility = "private" | "workspace" | "conversation" | "external";

export function PageSettingsDialog({
  open,
  onOpenChange,
  workspaceId,
  myWorkspaceUserId,
  pageId,
  title,
  onTitleChange,
  onTitleCommit,
  ownerDisplayName,
  ownerWorkspaceUserId,
  visibility,
  isOwner = false,
  purgedAt,
  collaborators,
  onPublish,
  onShare,
  onDuplicate,
  onTrash,
  onRecover,
  onEraseNow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  myWorkspaceUserId: string | null;
  pageId: string;
  title: string;
  onTitleChange: (value: string) => void;
  onTitleCommit: () => void;
  ownerDisplayName: string | null;
  ownerWorkspaceUserId: string | null;
  visibility: PageVisibility;
  isOwner?: boolean;
  purgedAt?: string | null;
  collaborators: Collaborator[];
  onPublish: () => void;
  onShare: () => void;
  onDuplicate: () => void;
  onTrash?: () => void;
  onRecover?: () => void;
  onEraseNow?: () => void;
}) {
  const trashed = isTrashed(purgedAt);
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
  const showPublish = visibility === "private" && !trashed;
  const showShare = visibility !== "workspace" && !trashed;
  const closeOnNavigate = () => onOpenChange(false);

  return (
    <TooltipProvider delayDuration={200}>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="detail">
        <DialogHeader>
          <DialogTitle>Page settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Title
            </label>
            <div className="flex items-center gap-2">
              <Input
                className="min-w-0 flex-1"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                onBlur={onTitleCommit}
                placeholder="Untitled"
              />
              {!trashed && (
                <PinToggle
                  workspaceId={workspaceId}
                  entityId={pageId}
                  kind="page"
                  className="size-8 shrink-0"
                />
              )}
            </div>
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
            <div className="text-sm break-words">
              {ownerDisplayName && ownerWorkspaceUserId ? (
                <UserLink
                  workspaceId={workspaceId}
                  workspaceUserId={ownerWorkspaceUserId}
                  myWorkspaceUserId={myWorkspaceUserId}
                  label={ownerDisplayName}
                  onNavigate={closeOnNavigate}
                />
              ) : (
                (ownerDisplayName ?? "—")
              )}
            </div>
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
                      <UserLink
                        workspaceId={workspaceId}
                        workspaceUserId={c.workspaceUserId}
                        myWorkspaceUserId={myWorkspaceUserId}
                        label={c.displayName}
                        onNavigate={closeOnNavigate}
                      />
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>

        {trashed && purgedAt ? (
          <DialogFooter className="sm:justify-start">
            <PageDeletionBanner
              purgedAt={purgedAt}
              isOwner={isOwner}
              onRecover={onRecover}
              onEraseNow={onEraseNow}
            />
          </DialogFooter>
        ) : (
          <>
            <DialogFooter className="flex-row justify-center gap-2 sm:justify-center">
              {showPublish && (
                <Button variant="secondary" onClick={onPublish}>
                  <Building2 className="size-3.5" /> Publish
                </Button>
              )}
              {showShare && (
                <Button variant="secondary" onClick={onShare}>
                  <MessageSquareShare className="size-3.5" /> Share
                </Button>
              )}
              <Button variant="secondary" onClick={onDuplicate}>
                <Copy className="size-3.5" /> Duplicate
              </Button>
            </DialogFooter>
            {isOwner && onTrash && (
              <div className="flex justify-end">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      aria-label="Delete page"
                      onClick={onTrash}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Delete page</TooltipContent>
                </Tooltip>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
    </TooltipProvider>
  );
}

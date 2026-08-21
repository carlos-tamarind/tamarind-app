import { Bookmark, BookmarkCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  usePinnedEntities,
  type PinKind,
} from "@/hooks/use-pinned-entities";

export function PinToggle({
  workspaceId,
  entityId,
  kind,
  className,
}: {
  workspaceId: string;
  entityId: string;
  kind: PinKind;
  className?: string;
}) {
  const { isPinned, toggle } = usePinnedEntities(workspaceId);
  const pinned = isPinned(entityId, kind);
  const noun = kind === "conversation" ? "conversation" : "page";
  const hint = pinned ? `Un-pin this ${noun}` : `Pin this ${noun}`;
  const Icon = pinned ? BookmarkCheck : Bookmark;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={className}
          aria-label={hint}
          aria-pressed={pinned}
          onClick={() => toggle(entityId, kind)}
        >
          <Icon className="size-4" strokeWidth={1.5} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{hint}</TooltipContent>
    </Tooltip>
  );
}

import { ThumbsDown, ThumbsUp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PendingConversationSuggestion } from "@/lib/conversation-suggestions.functions";

export function ConversationSuggestionNudge({
  suggestion,
  feedback,
  onOpen,
  onDismiss,
  onFeedback,
}: {
  suggestion: PendingConversationSuggestion;
  feedback: "positive" | "negative" | null;
  onOpen: () => void;
  onDismiss: () => void;
  onFeedback: (type: "positive" | "negative") => void;
}) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 max-w-sm">
      <div className="pointer-events-auto rounded-lg border bg-surface-raised shadow-md">
        <div className="relative px-3 pb-2 pt-7">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Dismiss suggestion"
                className="absolute right-1 top-1 size-7"
                onClick={onDismiss}
              >
                <X className="size-3.5" strokeWidth={1.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Dismiss</TooltipContent>
          </Tooltip>
          <button
            type="button"
            onClick={onOpen}
            className="w-full rounded-md px-1 py-1 text-left text-sm leading-snug text-foreground hover:bg-accent/60"
          >
            {suggestion.notificationText}
          </button>
        </div>
        <div className="flex items-center justify-end gap-0.5 border-t px-2 py-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Helpful"
                className={`size-7 ${feedback === "positive" ? "text-primary" : ""}`}
                disabled={feedback !== null}
                onClick={() => onFeedback("positive")}
              >
                <ThumbsUp className="size-3.5" strokeWidth={1.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Helpful</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Not helpful"
                className={`size-7 ${feedback === "negative" ? "text-primary" : ""}`}
                disabled={feedback !== null}
                onClick={() => onFeedback("negative")}
              >
                <ThumbsDown className="size-3.5" strokeWidth={1.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Not helpful</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

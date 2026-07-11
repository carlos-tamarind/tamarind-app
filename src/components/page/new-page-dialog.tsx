import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Globe, Lock, MessageSquare, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createBlankPage } from "@/lib/pages.functions";
import {
  createConversationPage,
  createPageFromMessages,
} from "@/lib/conversations.functions";

type Visibility = "private" | "workspace" | "conversation";
type Mode = "blank" | "fromMessages";

const MAX_TITLE = 50;
const FROM_MESSAGES_TEMPLATE = "from-messages";
const FROM_MESSAGES_TEMPLATE_LABEL =
  "New conversation page from message selection";

function graphemeLength(value: string) {
  return Array.from(value).length;
}

export function NewPageDialog({
  open,
  onOpenChange,
  workspaceId,
  conversationId,
  mode = "blank",
  presetTitle,
  messageIds,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  conversationId?: string;
  mode?: Mode;
  presetTitle?: string;
  messageIds?: string[];
  onCreated?: (pageId: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createBlank = useServerFn(createBlankPage);
  const createInConv = useServerFn(createConversationPage);
  const createFromMessages = useServerFn(createPageFromMessages);

  const isFromMessages = mode === "fromMessages" && !!conversationId;
  const defaultVisibility: Visibility = isFromMessages
    ? "conversation"
    : conversationId
      ? "conversation"
      : "private";

  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<Visibility>(defaultVisibility);
  const [submitting, setSubmitting] = useState(false);

  // Reset state every time the dialog opens
  useEffect(() => {
    if (open) {
      setTitle(isFromMessages && presetTitle ? presetTitle : "");
      setVisibility(defaultVisibility);
      setSubmitting(false);
    }
  }, [open, defaultVisibility, isFromMessages, presetTitle]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (graphemeLength(next) <= MAX_TITLE) setTitle(next);
  };

  const handleCreate = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const trimmed = title.trim();
      let pageId: string;
      if (isFromMessages && messageIds && messageIds.length > 0) {
        const v: "workspace" | "conversation" =
          visibility === "workspace" ? "workspace" : "conversation";
        const res = await createFromMessages({
          data: {
            conversationId: conversationId!,
            messageIds,
            ...(trimmed ? { title: trimmed } : {}),
            visibility: v,
          },
        });
        pageId = res.pageId;
        queryClient.invalidateQueries({
          queryKey: ["conversation-pages", conversationId],
        });
        queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      } else if (conversationId) {
        const v: "workspace" | "conversation" =
          visibility === "workspace" ? "workspace" : "conversation";
        const res = await createInConv({
          data: {
            conversationId,
            ...(trimmed ? { title: trimmed } : {}),
            visibility: v,
          },
        });
        pageId = res.pageId;
        queryClient.invalidateQueries({
          queryKey: ["conversation-pages", conversationId],
        });
        queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      } else {
        const v: "private" | "workspace" =
          visibility === "workspace" ? "workspace" : "private";
        const res = await createBlank({
          data: {
            workspaceId,
            ...(trimmed ? { title: trimmed } : {}),
            visibility: v,
          },
        });
        pageId = res.pageId;
      }
      queryClient.invalidateQueries({ queryKey: ["pages-list", workspaceId] });
      onOpenChange(false);
      if (onCreated) {
        onCreated(pageId);
      } else {
        navigate({
          to: "/w/$workspaceId",
          params: { workspaceId },
          search: (prev: any) => ({ ...prev, p: pageId }),
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New page</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="new-page-title"
              className="text-xs font-semibold text-muted-foreground"
            >
              Page title
            </label>
            <Input
              id="new-page-title"
              value={title}
              onChange={handleTitleChange}
              placeholder="My new page"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Page visibility
            </label>
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v as Visibility)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private" disabled={!!conversationId}>
                  <span className="flex items-center gap-2">
                    <Lock className="size-3.5" /> Private
                  </span>
                </SelectItem>
                <SelectItem value="workspace" disabled={!!conversationId}>
                  <span className="flex items-center gap-2">
                    <Globe className="size-3.5" /> Workspace
                  </span>
                </SelectItem>
                <SelectItem value="conversation" disabled={!conversationId}>
                  <span className="flex items-center gap-2">
                    <MessageSquare className="size-3.5" /> Conversation
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Page template
            </label>
            <Select
              disabled
              value={isFromMessages ? FROM_MESSAGES_TEMPLATE : "none"}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="No templates available" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No templates available</SelectItem>
                <SelectItem value={FROM_MESSAGES_TEMPLATE}>
                  {FROM_MESSAGES_TEMPLATE_LABEL}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

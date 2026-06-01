import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MessageSquarePlus, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NewConversationDialog } from "@/components/new-conversation-dialog";
import { createBlankPage } from "@/lib/pages.functions";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/")({
  component: WorkspaceIndex,
});

function WorkspaceIndex() {
  const { workspaceId } = useParams({ from: "/_authenticated/w/$workspaceId/" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [convOpen, setConvOpen] = useState(false);
  const [creatingPage, setCreatingPage] = useState(false);

  const newPage = useServerFn(createBlankPage);

  const handleNewPage = async () => {
    if (creatingPage) return;
    setCreatingPage(true);
    try {
      const { pageId } = await newPage({ data: { workspaceId } });
      queryClient.invalidateQueries({ queryKey: ["pages-list", workspaceId] });
      navigate({
        to: "/w/$workspaceId/p/$pageId",
        params: { workspaceId, pageId },
      });
    } catch (e) {
      console.error(e);
      setCreatingPage(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <p className="max-w-md text-base text-muted-foreground">
        Pick a conversation or page from the sidebar to get started, or create a new one:
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button variant="secondary" onClick={() => setConvOpen(true)}>
          <MessageSquarePlus className="size-4" />
          New conversation
        </Button>
        <Button variant="secondary" onClick={handleNewPage} disabled={creatingPage}>
          {creatingPage ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileText className="size-4" />
          )}
          New page
        </Button>
      </div>

      <NewConversationDialog
        workspaceId={workspaceId}
        open={convOpen}
        onOpenChange={setConvOpen}
      />
    </div>
  );
}

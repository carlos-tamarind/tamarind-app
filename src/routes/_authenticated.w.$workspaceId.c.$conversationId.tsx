import { createFileRoute, useParams } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/c/$conversationId")({
  component: ConversationView,
});

function ConversationView() {
  const { conversationId } = useParams({
    from: "/_authenticated/w/$workspaceId/c/$conversationId",
  });
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Conversation {conversationId.slice(0, 8)} — messages coming soon.
    </div>
  );
}

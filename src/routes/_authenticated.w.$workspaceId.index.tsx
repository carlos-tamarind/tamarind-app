import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/")({
  component: WorkspaceIndex,
});

function WorkspaceIndex() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Pick a conversation or page from the sidebar to get started.
    </div>
  );
}

import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/settings")({
  component: SettingsModal,
});

function SettingsModal() {
  const { workspaceId } = useParams({ from: "/_authenticated/w/$workspaceId/settings" });
  const navigate = useNavigate();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) navigate({ to: "/w/$workspaceId", params: { workspaceId } });
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Workspace settings</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Settings UI coming next: members, invites, plan tier, profile.
        </p>
      </DialogContent>
    </Dialog>
  );
}

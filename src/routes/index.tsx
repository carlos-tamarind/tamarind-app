import { createFileRoute, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { listMyWorkspaces, workspaceCountIsZero } from "@/lib/workspaces.functions";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      const bootstrap = await workspaceCountIsZero().catch(() => ({ isZero: false }));
      if (bootstrap?.isZero) throw redirect({ to: "/bootstrap" });
      throw redirect({ to: "/login" });
    }

    const workspaces = await listMyWorkspaces().catch(() => []);
    if (workspaces && workspaces.length > 0) {
      throw redirect({
        to: "/w/$workspaceId",
        params: { workspaceId: workspaces[0].workspaceId },
      });
    }
  },
  component: NoWorkspace,
});

function NoWorkspace() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <p className="text-sm text-muted-foreground">
        You're not a member of any workspace yet. Ask an admin for an invite.
      </p>
      <button
        onClick={async () => {
          await supabase.auth.signOut();
          window.location.assign("/login");
        }}
        className="text-sm underline"
      >
        Sign out
      </button>
    </div>
  );
}

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { listMyWorkspaces, workspaceCountIsZero } from "@/lib/workspaces.functions";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { loading, user } = useAuth();
  const { data: bootstrap } = useQuery({
    queryKey: ["bootstrap-check"],
    queryFn: () => workspaceCountIsZero(),
  });
  const { data: workspaces } = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: () => listMyWorkspaces(),
    enabled: !!user,
  });

  if (loading) return <CenteredMessage message="Loading…" />;

  if (!user) {
    if (bootstrap?.isZero) throw redirect({ to: "/bootstrap" });
    throw redirect({ to: "/login" });
  }

  if (workspaces && workspaces.length > 0) {
    throw redirect({
      to: "/w/$workspaceId",
      params: { workspaceId: workspaces[0].workspaceId },
    });
  }

  if (workspaces && workspaces.length === 0) {
    return (
      <CenteredMessage
        message="You're not a member of any workspace yet. Ask an admin for an invite."
        action={
          <button
            onClick={async () => {
              await supabase.auth.signOut();
            }}
            className="text-sm underline"
          >
            Sign out
          </button>
        }
      />
    );
  }

  return <CenteredMessage message="Loading workspaces…" />;
}

function CenteredMessage({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

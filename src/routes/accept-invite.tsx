import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { acceptInvite, getInviteByToken } from "@/lib/invites.functions";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({ token: z.string().min(8).max(128) });

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (s) => searchSchema.parse(s),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const fetchInvite = useServerFn(getInviteByToken);
  const acceptFn = useServerFn(acceptInvite);

  const { data, isLoading } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => fetchInvite({ data: { token } }),
  });

  const accept = useMutation({
    mutationFn: () => acceptFn({ data: { token } }),
    onSuccess: ({ workspaceId }) => {
      toast.success("Joined workspace");
      navigate({ to: "/w/$workspaceId", params: { workspaceId } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to accept invite"),
  });

  // Auto-accept when signed in with the matching email
  useEffect(() => {
    if (
      data?.status === "valid" &&
      user?.email &&
      user.email.toLowerCase() === data.email.toLowerCase() &&
      !accept.isPending &&
      !accept.isSuccess
    ) {
      accept.mutate();
    }
  }, [data, user, accept]);

  if (isLoading || authLoading) {
    return <Centered>Loading invite…</Centered>;
  }

  if (!data || data.status === "not_found") {
    return <Centered>This invite link is invalid.</Centered>;
  }
  if (data.status === "expired") {
    return <Centered>This invite has expired. Ask an admin for a new link.</Centered>;
  }
  if (data.status === "accepted") {
    return <Centered>This invite has already been used.</Centered>;
  }

  // Valid invite
  if (!user) {
    const redirect = `/accept-invite?token=${encodeURIComponent(token)}`;
    return (
      <Centered>
        <div className="space-y-4 text-center">
          <h1 className="text-xl font-semibold">Join {data.workspaceName}</h1>
          <p className="text-sm text-muted-foreground">
            You were invited as <strong>{data.email}</strong> ({data.roleKey}). Sign in with
            that email to accept.
          </p>
          <Link to="/login" search={{ redirect } as any}>
            <Button>Sign in to accept</Button>
          </Link>
        </div>
      </Centered>
    );
  }

  if (user.email?.toLowerCase() !== data.email.toLowerCase()) {
    return (
      <Centered>
        <div className="space-y-3 text-center">
          <p className="text-sm">
            This invite is for <strong>{data.email}</strong>, but you are signed in as{" "}
            <strong>{user.email}</strong>.
          </p>
          <p className="text-xs text-muted-foreground">
            Sign out and sign in with the invited email to accept.
          </p>
        </div>
      </Centered>
    );
  }

  return <Centered>Accepting invite…</Centered>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center text-sm">{children}</div>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createWorkspaceBootstrapInvite,
  getIsPlatformOwner,
  listWorkspaceBootstrapInvites,
  revokeWorkspaceBootstrapInvite,
} from "@/lib/workspace-bootstrap-invites.functions";

export const Route = createFileRoute("/_authenticated/generate-workspace-invite")({
  component: GenerateWorkspaceInvitePage,
});

const DEFAULT_EXPIRY_HOURS = 72;

function GenerateWorkspaceInvitePage() {
  const navigate = useNavigate();
  const fetchIsOwner = useServerFn(getIsPlatformOwner);

  const { data: ownerCheck, isLoading } = useQuery({
    queryKey: ["is-platform-owner"],
    queryFn: () => fetchIsOwner(),
  });

  const isOwner = ownerCheck?.isOwner ?? false;

  useEffect(() => {
    if (isLoading) return;
    if (isOwner) return;
    void navigate({ to: "/", replace: true });
  }, [isLoading, isOwner, navigate]);

  if (isLoading || !isOwner) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-10">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Generate workspace invite</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a single-use, time-limited link that lets someone create a new workspace and become
          its admin.
        </p>
      </div>
      <GenerateForm />
      <InvitesList />
    </div>
  );
}

function GenerateForm() {
  const qc = useQueryClient();
  const create = useServerFn(createWorkspaceBootstrapInvite);

  const [expiresInHours, setExpiresInHours] = useState(String(DEFAULT_EXPIRY_HOURS));
  const [adminEmail, setAdminEmail] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");

  const createMut = useMutation({
    mutationFn: (input: { expiresInHours: number; adminEmail?: string; welcomeMessage?: string }) =>
      create({ data: input }),
    onSuccess: () => {
      setAdminEmail("");
      setWelcomeMessage("");
      toast.success("Invite created");
      qc.invalidateQueries({ queryKey: ["workspace-bootstrap-invites"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create invite"),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const hours = Number(expiresInHours);
        if (!Number.isInteger(hours) || hours < 1) {
          toast.error("Expiry must be a whole number of hours");
          return;
        }
        createMut.mutate({
          expiresInHours: hours,
          adminEmail: adminEmail.trim() || undefined,
          welcomeMessage: welcomeMessage.trim() || undefined,
        });
      }}
      className="space-y-4 rounded-lg border p-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="expires">Expires in (hours)</Label>
        <Input
          id="expires"
          type="number"
          min={1}
          value={expiresInHours}
          onChange={(e) => setExpiresInHours(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="admin-email">Lock to admin email (optional)</Label>
        <Input
          id="admin-email"
          type="email"
          placeholder="Leave blank to let the recipient supply their own"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="welcome-message">Personalized welcome message (optional)</Label>
        <Textarea
          id="welcome-message"
          placeholder="Shown on the bootstrap page when they open the link"
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
          rows={3}
        />
      </div>
      <Button type="submit" disabled={createMut.isPending}>
        {createMut.isPending ? "Generating…" : "Generate invite"}
      </Button>
    </form>
  );
}

function InvitesList() {
  const qc = useQueryClient();
  const list = useServerFn(listWorkspaceBootstrapInvites);
  const revoke = useServerFn(revokeWorkspaceBootstrapInvite);

  const invitesQuery = useQuery({
    queryKey: ["workspace-bootstrap-invites"],
    queryFn: () => list(),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      toast.success("Invite revoked");
      qc.invalidateQueries({ queryKey: ["workspace-bootstrap-invites"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to revoke"),
  });

  const inviteLink = (token: string) =>
    `${window.location.origin}/bootstrap?token=${encodeURIComponent(token)}`;

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(inviteLink(token));
    toast.success("Invite link copied");
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">Generated invites</h3>
      {invitesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : invitesQuery.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invites yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {invitesQuery.data?.map((inv) => {
            const expired = new Date(inv.expiresAt) < new Date();
            const status = inv.usedAt ? "used" : expired ? "expired" : "pending";
            return (
              <li key={inv.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{inv.adminEmail ?? "Any email"}</div>
                  <div className="text-xs text-muted-foreground">{status}</div>
                </div>
                {status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyLink(inv.token)}
                      title="Copy invite link"
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revokeMut.mutate(inv.id)}
                      title="Revoke"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

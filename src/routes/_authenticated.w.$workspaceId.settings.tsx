import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";
import { z } from "zod";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createInvite,
  listInvites,
  revokeInvite,
} from "@/lib/invites.functions";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/settings")({
  validateSearch: (search) =>
    z
      .object({
        c: z.string().uuid().optional(),
        p: z.string().uuid().optional(),
      })
      .parse(search),
  component: SettingsModal,
});

function SettingsModal() {
  const { workspaceId } = useParams({ from: "/_authenticated/w/$workspaceId/settings" });
  const navigate = useNavigate();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open)
          navigate({
            to: "/w/$workspaceId",
            params: { workspaceId },
            search: (prev) => prev,
          });
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Workspace settings</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="invites">
          <TabsList>
            <TabsTrigger value="invites">Invites</TabsTrigger>
            <TabsTrigger value="general" disabled>General</TabsTrigger>
          </TabsList>
          <TabsContent value="invites" className="mt-4">
            <InvitesPanel workspaceId={workspaceId} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function InvitesPanel({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listInvites);
  const create = useServerFn(createInvite);
  const revoke = useServerFn(revokeInvite);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");

  const invitesQuery = useQuery({
    queryKey: ["invites", workspaceId],
    queryFn: () => list({ data: { workspaceId } }),
  });

  const createMut = useMutation({
    mutationFn: (input: { email: string; roleKey: typeof role }) =>
      create({ data: { workspaceId, ...input } }),
    onSuccess: () => {
      setEmail("");
      toast.success("Invite created");
      qc.invalidateQueries({ queryKey: ["invites", workspaceId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create invite"),
  });

  const revokeMut = useMutation({
    mutationFn: (inviteId: string) => revoke({ data: { workspaceId, inviteId } }),
    onSuccess: () => {
      toast.success("Invite revoked");
      qc.invalidateQueries({ queryKey: ["invites", workspaceId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to revoke"),
  });

  const inviteLink = (token: string) =>
    `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`;

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(inviteLink(token));
    toast.success("Invite link copied");
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          createMut.mutate({ email: email.trim(), roleKey: role });
        }}
        className="flex items-end gap-2"
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="teammate@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="w-32 space-y-1.5">
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={createMut.isPending}>
          {createMut.isPending ? "Inviting…" : "Invite"}
        </Button>
      </form>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          Pending invites
        </h3>
        {invitesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : invitesQuery.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invites yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {invitesQuery.data?.map((inv) => {
              const expired = new Date(inv.expiresAt) < new Date();
              const status = inv.acceptedAt
                ? "accepted"
                : expired
                ? "expired"
                : "pending";
              return (
                <li key={inv.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{inv.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {inv.roleKey} · {status}
                    </div>
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
    </div>
  );
}

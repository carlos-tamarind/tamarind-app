import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { listMyWorkspaces } from "@/lib/workspaces.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [noWorkspaceOpen, setNoWorkspaceOpen] = useState(false);

  const routeAfterLogin = async () => {
    if (redirect && redirect.startsWith("/")) {
      window.location.assign(redirect);
      return;
    }
    try {
      const workspaces = await listMyWorkspaces();
      if (workspaces && workspaces.length > 0) {
        navigate({
          to: "/w/$workspaceId",
          params: { workspaceId: workspaces[0].workspaceId },
        });
      } else {
        setNoWorkspaceOpen(true);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load workspaces");
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    await routeAfterLogin();
    setBusy(false);
  };

  const handleGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: redirect && redirect.startsWith("/")
        ? `${window.location.origin}${redirect}`
        : window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error(result.error.message ?? "Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    await routeAfterLogin();
    setBusy(false);
  };

  const handleCloseNoWorkspace = async () => {
    setNoWorkspaceOpen(false);
    await supabase.auth.signOut();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to Mento</h1>
          <p className="mt-1 text-sm text-muted-foreground">Invite-only workspace.</p>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
          Continue with Google
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/forgot-password" className="underline">Forgot password?</Link>
        </p>
      </div>

      <Dialog
        open={noWorkspaceOpen}
        onOpenChange={(open) => {
          if (!open) {
            void handleCloseNoWorkspace();
          }
        }}
      >
        <DialogContent
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>No workspace access</DialogTitle>
            <DialogDescription>
              Currently you don't have access to any workspaces. Please ask the admin
              of your organization to invite you to a workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseNoWorkspace}>
              Go back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

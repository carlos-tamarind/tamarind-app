import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { bootstrapFirstWorkspace } from "@/lib/workspaces.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/bootstrap")({
  component: BootstrapPage,
});

function BootstrapPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        // Try sign-in first (handles "user already exists" case), fall back to sign-up.
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) {
          const { data: signupData, error: signupErr } = await supabase.auth.signUp({ email, password });
          if (signupErr) throw signupErr;
          if (!signupData.session) {
            const { error: retryErr } = await supabase.auth.signInWithPassword({ email, password });
            if (retryErr) throw retryErr;
          }
        }
      }
      const { workspaceId } = await bootstrapFirstWorkspace({ data: { name: workspaceName } });
      toast.success("Workspace created");
      navigate({ to: "/w/$workspaceId", params: { workspaceId } });
    } catch (err: any) {
      toast.error(err.message ?? "Bootstrap failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Set up Mento</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create the first workspace and admin account.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="workspace">Workspace name</Label>
          <Input id="workspace" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Admin email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Create workspace"}
        </Button>
      </form>
    </div>
  );
}

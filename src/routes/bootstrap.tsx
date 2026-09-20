import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { createOwnWorkspace, listMyWorkspaces } from "@/lib/workspaces.functions";
import {
  bootstrapWorkspaceWithInvite,
  getWorkspaceBootstrapInviteByToken,
} from "@/lib/workspace-bootstrap-invites.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth-layout";
import { NotFound } from "@/components/not-found";

const searchSchema = z.object({ token: z.string().min(8).max(128).optional() });

export const Route = createFileRoute("/bootstrap")({
  validateSearch: (s) => searchSchema.parse(s),
  component: BootstrapPage,
});

function BootstrapPage() {
  const { token } = Route.useSearch();

  if (token) return <InviteBootstrapForm token={token} />;
  return <NoTokenBootstrap />;
}

/**
 * Without a token, the only legitimate audience is a self-serve signup who just
 * confirmed their email: signed in, zero workspaces. Anything else (anonymous
 * visitor, or a user who already has a workspace) gets a 404 — /bootstrap is
 * not a public entry point.
 */
function NoTokenBootstrap() {
  const listWorkspaces = useServerFn(listMyWorkspaces);

  const { data, isLoading } = useQuery({
    queryKey: ["bootstrap-entry"],
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return { signedIn: false as const, workspaceId: null };
      const workspaces = await listWorkspaces().catch(() => []);
      return {
        signedIn: true as const,
        workspaceId: workspaces.length > 0 ? workspaces[0].workspaceId : null,
      };
    },
  });

  if (isLoading) return <Centered>Loading…</Centered>;
  if (data?.signedIn && !data.workspaceId) return <SelfServeBootstrapForm />;
  return <NotFound />;
}

/** Signed in via the signup confirmation link: pick a password, name the workspace. */
function SelfServeBootstrapForm() {
  const navigate = useNavigate();
  const createWorkspace = useServerFn(createOwnWorkspace);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { error: pwErr } = await supabase.auth.updateUser({ password });
      if (pwErr) throw pwErr;

      const { workspaceId } = await createWorkspace({ data: { name: workspaceName } });
      toast.success("Workspace created");
      navigate({ to: "/w/$workspaceId", params: { workspaceId } });
    } catch (err: any) {
      toast.error(err.message ?? "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Finish setting up"
      subtitle="Choose a password and name your workspace."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="workspace">Workspace name</Label>
          <Input
            id="workspace"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            show={showPassword}
            onToggleShow={() => setShowPassword((s) => !s)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <PasswordInput
            id="confirmPassword"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showConfirm}
            onToggleShow={() => setShowConfirm((s) => !s)}
          />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Create workspace"}
        </Button>
      </form>
    </AuthLayout>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  show,
  onToggleShow,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={8}
        className="pr-10"
      />
      <button
        type="button"
        onClick={onToggleShow}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        tabIndex={-1}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function InviteBootstrapForm({ token }: { token: string }) {
  const navigate = useNavigate();
  const fetchInvite = useServerFn(getWorkspaceBootstrapInviteByToken);
  const bootstrapWithInvite = useServerFn(bootstrapWorkspaceWithInvite);

  const { data, isLoading } = useQuery({
    queryKey: ["workspace-bootstrap-invite", token],
    queryFn: () => fetchInvite({ data: { token } }),
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [busy, setBusy] = useState(false);

  // Invalid, expired or already-used tokens are indistinguishable from a made-up
  // URL: render the same 404 rather than confirming a token ever existed.
  if (isLoading) return <Centered>Loading invite…</Centered>;
  if (!data || data.status !== "valid") return <NotFound />;

  const lockedEmail = data.adminEmail;
  const effectiveEmail = lockedEmail ?? email;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        // Try sign-in first (handles "user already exists" case), fall back to sign-up.
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: effectiveEmail,
          password,
        });
        if (signInErr) {
          const { data: signupData, error: signupErr } = await supabase.auth.signUp({
            email: effectiveEmail,
            password,
          });
          if (signupErr) throw signupErr;
          if (!signupData.session) {
            const { error: retryErr } = await supabase.auth.signInWithPassword({
              email: effectiveEmail,
              password,
            });
            if (retryErr) throw retryErr;
          }
        }
      }
      const { workspaceId } = await bootstrapWithInvite({
        data: { token, name: workspaceName },
      });
      toast.success("Workspace created");
      navigate({ to: "/w/$workspaceId", params: { workspaceId } });
    } catch (err: any) {
      toast.error(err.message ?? "Bootstrap failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={data.welcomeMessage || "Set up your workspace"}
      subtitle="Create your admin account and name your workspace."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="workspace">Workspace name</Label>
          <Input
            id="workspace"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Admin email</Label>
          <Input
            id="email"
            type="email"
            value={effectiveEmail}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!!lockedEmail}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            show={showPassword}
            onToggleShow={() => setShowPassword((s) => !s)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <PasswordInput
            id="confirmPassword"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showConfirm}
            onToggleShow={() => setShowConfirm((s) => !s)}
          />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Create workspace"}
        </Button>
      </form>
    </AuthLayout>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

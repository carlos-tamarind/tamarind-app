import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import {
  acceptInvite,
  acceptInviteWithSignup,
  getInviteByToken,
} from "@/lib/invites.functions";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth-layout";

const searchSchema = z.object({ token: z.string().min(8).max(128) });

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (s) => searchSchema.parse(s),
  component: AcceptInvitePage,
});

type Step = "welcome" | "signup";

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const fetchInvite = useServerFn(getInviteByToken);
  const acceptFn = useServerFn(acceptInvite);
  const acceptSignupFn = useServerFn(acceptInviteWithSignup);

  const [step, setStep] = useState<Step>("welcome");

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

  if (isLoading || authLoading) return <Centered>Loading invite…</Centered>;
  if (!data || data.status === "not_found")
    return <Centered>This invite link is invalid.</Centered>;
  if (data.status === "expired")
    return <Centered>This invite has expired. Ask an admin for a new link.</Centered>;
  if (data.status === "accepted")
    return <Centered>This invite has already been used.</Centered>;

  // Signed-in mismatch
  if (user && user.email?.toLowerCase() !== data.email.toLowerCase()) {
    return (
      <Centered>
        <div className="space-y-3 text-center">
          <p className="text-sm">
            This invite is for <strong>{data.email}</strong>, but you are signed in
            as <strong>{user.email}</strong>.
          </p>
          <p className="text-xs text-muted-foreground">
            Sign out and sign in with the invited email to accept.
          </p>
        </div>
      </Centered>
    );
  }

  if (user) return <Centered>Accepting invite…</Centered>;

  // Not signed in → welcome → signup
  if (step === "welcome") {
    return (
      <AuthLayout
        title={`Join ${data.workspaceName}`}
        subtitle={
          <>
            You were invited as <strong className="text-foreground">{data.email}</strong>{" "}
            ({data.roleKey}). Create your account to accept.
          </>
        }
      >
        <Button size="lg" className="w-full" onClick={() => setStep("signup")}>
          Continue
        </Button>
      </AuthLayout>
    );
  }

  return (
    <SignupForm
      email={data.email}
      onSubmit={async (password) => {
        try {
          const res = await acceptSignupFn({ data: { token, password } });
          // Sign the new user in
          const { error: signInErr } = await supabase.auth.signInWithPassword({
            email: res.email,
            password,
          });
          if (signInErr) throw signInErr;
          toast.success("Account created");
          navigate({
            to: "/w/$workspaceId",
            params: { workspaceId: res.workspaceId },
          });
        } catch (e: any) {
          toast.error(e?.message ?? "Failed to create account");
        }
      }}
    />
  );
}

function SignupForm({
  email,
  onSubmit,
}: {
  email: string;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    await onSubmit(password);
    setBusy(false);
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set a password to finish joining the workspace."
    >
      <form onSubmit={handleSubmit} className="w-full space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} disabled />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 right-2 flex items-center text-muted-foreground"
              tabIndex={-1}
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <div className="relative">
            <Input
              id="confirm"
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((s) => !s)}
              className="absolute inset-y-0 right-2 flex items-center text-muted-foreground"
              tabIndex={-1}
              aria-label={showConfirm ? "Hide password" : "Show password"}
            >
              {showConfirm ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center text-sm text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

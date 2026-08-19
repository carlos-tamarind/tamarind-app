import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth-layout";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Reset email sent");
  };

  return (
    <AuthLayout
      title="Reset password"
      subtitle="We'll email you a link to set a new one."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/login" className="underline underline-offset-2 hover:text-foreground">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

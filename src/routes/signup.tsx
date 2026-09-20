import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { AuthLayout } from "@/components/auth-layout";
import { TermsDialog } from "@/components/terms-dialog";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestSignup } from "@/lib/signup.functions";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Request access — Tamarind" },
      {
        name: "description",
        content:
          "Request access to Tamarind, the shared workspace where conversations and pages keep their context.",
      },
      { property: "og:title", content: "Request access — Tamarind" },
      {
        property: "og:description",
        content:
          "Request access to Tamarind, the shared workspace where conversations and pages keep their context.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const submitSignup = useServerFn(requestSignup);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [needsCaptcha, setNeedsCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handleToken = useCallback((token: string) => setCaptchaToken(token), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) {
      toast.error("Please accept the terms to continue");
      return;
    }
    setBusy(true);
    try {
      const result = await submitSignup({
        data: {
          name: name.trim(),
          email: email.trim(),
          termsAccepted: true as const,
          ...(captchaToken ? { turnstileToken: captchaToken } : {}),
        },
      });

      if (result.status === "captcha_required") {
        setNeedsCaptcha(true);
        setCaptchaToken(undefined);
        toast.message("One more step", {
          description: "Please complete the verification below and submit again.",
        });
        return;
      }
      setSent(true);
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="If that address can be used, we've sent a confirmation email. Open it and click Verify Email to finish setting up your workspace."
      >
        <p className="text-sm text-muted-foreground">
          Didn't get it? Check your spam folder, or{" "}
          <button type="button" className="underline underline-offset-2" onClick={() => setSent(false)}>
            try a different address
          </button>
          .
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Request access"
      subtitle="Tell us who you are and we'll email you a confirmation link."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            required
            autoComplete="name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="flex items-start gap-2.5">
          <Checkbox
            id="terms"
            checked={accepted}
            onCheckedChange={(v) => setAccepted(v === true)}
            className="mt-0.5"
          />
          <Label htmlFor="terms" className="text-sm font-normal leading-snug text-muted-foreground">
            I agree to the{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => setTermsOpen(true)}
            >
              Terms &amp; Conditions
            </button>
            .
          </Label>
        </div>

        {needsCaptcha ? <TurnstileWidget onToken={handleToken} /> : null}

        <Button type="submit" size="lg" className="w-full" disabled={busy || !accepted}>
          {busy ? "Sending…" : "Request access"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="underline underline-offset-2 hover:text-foreground">
            Sign in
          </Link>
        </p>
      </form>

      <TermsDialog open={termsOpen} onOpenChange={setTermsOpen} />
    </AuthLayout>
  );
}

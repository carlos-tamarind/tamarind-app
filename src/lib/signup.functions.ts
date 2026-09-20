import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createHash } from "crypto";
import { z } from "zod";

import { isDisposableEmailDomain } from "./disposable-email-domains";

const APP_BASE_URL = "https://app.tamarind.so";
// A burst of attempts from the same address or the same visitor within this
// window is what "suspicious" means beyond throwaway-mail domains.
const ATTEMPT_WINDOW_MINUTES = 60;
const MAX_ATTEMPTS_PER_EMAIL = 2;
const MAX_ATTEMPTS_PER_IP = 4;

export type RequestSignupResult =
  | { status: "sent" }
  | { status: "captcha_required" };

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(30, "Name must be 30 characters or less"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(320),
  termsAccepted: z.literal(true),
  turnstileToken: z.string().max(4096).optional(),
});

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requestInfo(): { origin: string; ip: string | null } {
  try {
    const headers = getRequest().headers;
    const ip =
      headers.get("cf-connecting-ip") ??
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    return { origin: headers.get("origin") ?? APP_BASE_URL, ip };
  } catch {
    return { origin: APP_BASE_URL, ip: null };
  }
}

async function verifyTurnstile(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  // Not configured yet: don't lock people out of signup over a missing key.
  if (!secret) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}

/**
 * Public self-serve signup. Always resolves to the same neutral outcome so the
 * form can never be used to discover which addresses already have an account.
 */
export const requestSignup = createServerFn({ method: "POST" })
  .inputValidator((input) => signupSchema.parse(input))
  .handler(async ({ data }): Promise<RequestSignupResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { origin, ip } = requestInfo();
    const emailHash = hash(data.email);
    const ipHash = ip ? hash(ip) : null;
    const since = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000).toISOString();

    const [{ count: emailCount }, { count: ipCount }] = await Promise.all([
      supabaseAdmin
        .from("signup_attempts")
        .select("id", { count: "exact", head: true })
        .eq("email_hash", emailHash)
        .gte("created_at", since),
      ipHash
        ? supabaseAdmin
            .from("signup_attempts")
            .select("id", { count: "exact", head: true })
            .eq("ip_hash", ipHash)
            .gte("created_at", since)
        : Promise.resolve({ count: 0 } as { count: number }),
    ]);

    const suspicious =
      isDisposableEmailDomain(data.email) ||
      (emailCount ?? 0) >= MAX_ATTEMPTS_PER_EMAIL ||
      (ipCount ?? 0) >= MAX_ATTEMPTS_PER_IP;

    if (suspicious && !(await verifyTurnstile(data.turnstileToken, ip))) {
      return { status: "captcha_required" };
    }

    await supabaseAdmin
      .from("signup_attempts")
      .insert({ email_hash: emailHash, ip_hash: ipHash });

    // Sends the confirmation email through the project's auth email templates.
    // The link lands on /bootstrap, where the account is finished off.
    const { createClient } = await import("@supabase/supabase-js");
    const publishable = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { error } = await publishable.auth.signInWithOtp({
      email: data.email,
      options: {
        shouldCreateUser: true,
        data: { full_name: data.name },
        emailRedirectTo: `${origin}/bootstrap`,
      },
    });

    if (error) {
      // Never surface provider detail: it would leak whether the address exists.
      console.error("[signup] confirmation email failed:", error.message);
    }

    return { status: "sent" };
  });

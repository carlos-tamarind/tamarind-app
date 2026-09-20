# Self-serve signup at /signup

Today the only way in is an invite link. This adds a public signup form so a visitor from the website can request access, confirm their email, and set up their own workspace.

## The flow

```text
website CTA
   -> app.tamarind.so/signup        Name + Email + terms checkbox
   -> "Check your email" message    (same message whether or not the email exists)
   -> confirmation email            "Verify Email" button
   -> /bootstrap                    choose a password + name the workspace
   -> /w/<new workspace>
```

## The signup form

- **Name** — plain text, required, max 30 characters.
- **Email** — required, validated.
- **Terms checkbox** — required. The "Terms & Conditions" text opens in a normal app dialog (X in the top-right, Close button, click-outside and Escape to dismiss). Wording states that the name and email are collected solely to create and administer a Tamarind account, are not shared with third parties, and are not used for any other purpose, and that the account can be deleted on request.
- On submit the screen always shows the same neutral confirmation ("If that address can be used, we've sent a confirmation email"), so the form never reveals which addresses already have an account.
- The page reuses the existing auth screen layout, so it matches login and bootstrap.

## Bot check

A Cloudflare Turnstile widget appears only when the submission looks suspicious:

- the email domain is on a disposable/throwaway-mail list, or
- several signup attempts have come from the same address or the same visitor in a short window.

Normal signups never see it. When triggered, the form shows the widget and the signup is only accepted once the challenge is verified on the server. This needs a Turnstile site key and secret key from Cloudflare — I'll request the secret when we build.

## After the email is confirmed

The confirmation link lands on `/bootstrap`, which gains a third mode for a signed-in user with no workspace: set a password and name the workspace, then go straight into it. The existing first-workspace and invite-token modes are untouched.

**One workspace per email** is enforced on the server at creation time: if the account already belongs to any workspace, creation is refused and the user is sent to their existing workspace instead.

## Login page tweaks

- Remove the "Invite-only workspace." subtitle.
- Add a "Request access" link next to "Forgot password?" in the bottom row, pointing to `/signup`.

## Out of scope

Website changes, and removing `/generate-workspace-invite` and its table (separate task).

## Technical notes

- New public route `src/routes/signup.tsx` using `AuthLayout`, shadcn `Checkbox` + `Dialog` for terms.
- New `src/lib/signup.functions.ts` (public, unauthenticated `createServerFn`):
  - Zod validation (`name` 1–30 trimmed, `email` email + max 320, `termsAccepted` literal true, optional `turnstileToken`).
  - Suspicious check: disposable-domain list module + attempt-count lookup; returns `{ status: "captcha_required" }` when a token is needed, so the form can render the widget and resubmit.
  - Turnstile verification against `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `TURNSTILE_SECRET_KEY` (read inside the handler); `VITE_TURNSTILE_SITE_KEY` for the widget.
  - On success calls `supabaseAdmin.auth.admin.generateLink({ type: 'signup' | 'magiclink', email, options: { data: { full_name }, redirectTo: <origin>/bootstrap } })` — origin resolved from the request `Origin` header with `https://app.tamarind.so` fallback, same helper style as `invites.functions.ts`. Always returns the same neutral result.
- Migration: `public.signup_attempts` (id, email_hash text, ip_hash text, created_at, index on created_at and email_hash), RLS enabled with no policies, `GRANT ALL ... TO service_role` only — written and read exclusively through `supabaseAdmin`.
- `src/routes/bootstrap.tsx`: add `SelfServeBootstrapForm` rendered when there is a session, no token, and the user has zero memberships; fields = workspace name + password/confirm (`supabase.auth.updateUser({ password })` then create workspace).
- New `createOwnWorkspace` server fn in `src/lib/workspaces.functions.ts` with `requireSupabaseAuth`: rejects when `workspace_users` already has a row for the caller, otherwise `createWorkspaceAndAssignAdmin`.
- Ensure email/password auth is enabled and email confirmation is required (no auto-confirm).
- Route `head()` metadata for `/signup`; docs update in `docs/interface/user_onboarding.md`.

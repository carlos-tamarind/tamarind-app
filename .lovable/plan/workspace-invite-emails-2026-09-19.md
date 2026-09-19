# Workspace invite emails

Sending an invite from workspace settings currently only stores the invite and returns a link to copy. This adds a real email to the invited address.

## Can the existing templates be reused?

No. The templates listed under Cloud → Emails (Invitation, Signup confirmation, etc.) are **account/auth emails**: they are only sent by the login system itself, and their link is a one-time auth link it generates. A workspace invite is triggered by your own code and carries your own token (`/accept-invite?token=...`), so it needs its own app email template. The new template will be styled to match the existing ones, so both look like the same product.

Good news: the sender domain `notify.tamarind.so` is already verified, so emails can go out as soon as this ships.

## What gets built

1. **App email support** — scaffold the app email template registry, the server-only send helper, and the dashboard preview surface.
2. **Workspace invite template** — shows the workspace name, who invited them, the role they were invited as, the 24-hour expiry, and a button to accept the invite.
3. **Send on invite creation** — after the invite row is stored, the email goes out to the invited address. The link is still returned so the admin can copy it as a fallback.

If the recipient previously unsubscribed or bounced, the send is skipped silently and the invite is still created — the admin can share the link manually.

## Technical detail

- Call `email_domain--scaffold_transactional_email_templates` (creates `src/lib/email-templates/registry.ts`, `send-email.ts`, and `/lovable/email/transactional/preview`).
- New `src/lib/email-templates/workspace-invite.tsx` exporting `template satisfies TemplateEntry`, props: `workspaceName`, `inviterName`, `roleKey`, `acceptUrl`, `expiresAt`. Styling copied from `invite.tsx` (same container/heading/button constants, white body, dark-mode button override). Register as `workspace-invite` in `TEMPLATES`.
- In `createInvite` (`src/lib/invites.functions.ts`), after the `workspace_invites` insert:
  - fetch workspace name from `workspaces` and the inviter's display name from the inviter's `workspace_users` profile row (single admin query each),
  - build `acceptUrl` from a site-URL constant matching the one in the auth webhook route (`https://tamarind.so`),
  - `await sendTemplateEmail('workspace-invite', email, { templateData: {...}, idempotencyKey: \`workspace-invite-${row.id}\` })`.
- Send failures are caught and logged server-side; invite creation still succeeds and the response gains `emailSent: boolean` so the settings UI can note whether the email went out.
- No database changes, no unsubscribe handling (Lovable appends its own footer).

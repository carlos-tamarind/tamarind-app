# Why invite emails aren't arriving

## Diagnosis (confirmed)

Nothing is broken — no email is ever sent. Two findings:

1. The invite creation code only stores the invite and returns a token. There is no send step anywhere in the project (no email code, no email templates, no email packages installed).
2. The project has no sender domain set up, so it currently cannot send any email at all.

So the link you copy is the only delivery channel today.

## What to build

1. **Set up a sender domain** — emails must come from a domain you own (e.g. `notify.yourdomain.com`). This is a prerequisite; nothing can be delivered before it is verified.
2. **Add email infrastructure and an invite email template** — a branded "You've been invited to {workspace}" message with the join button pointing at `/accept-invite?token=…`, plus the inviter's name and expiry note.
3. **Send on invite creation** — when an admin adds an email in workspace settings, the invite is created and the email is sent to that one recipient, with a de-duplication key so retries don't double-send.
4. **Show the result in the UI** — success/failure feedback on the invite form, and keep the "copy link" fallback.

## Technical notes

- Send from the existing `createInvite` server function in `src/lib/invites.functions.ts`, after the invite row is inserted, using the scaffolded app-email helper and a registered template.
- Idempotency key derived from the invite id + template name.
- Failure to send should not roll back the invite; surface a warning and keep the copyable link.
- Same pattern can later cover the workspace bootstrap invites route.

## Not included

- Resending/reminder emails, bulk invites, or marketing email of any kind.

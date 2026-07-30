# User Onboarding

Tamarind supports multiple paths for users to join the platform: first-workspace bootstrap, email/password login, OAuth, and token-based invites.

## Entry Routing

[`src/routes/index.tsx`](../../src/routes/index.tsx) handles the root `/` redirect:

```mermaid
flowchart TD
  Root["/"]
  Auth{"Authenticated?"}
  ZeroWS{"Zero workspaces?"}
  Login["/login"]
  Bootstrap["/bootstrap"]
  Workspace["/w/$firstWorkspaceId"]

  Root --> Auth
  Auth -->|no| ZeroWS
  ZeroWS -->|yes| Bootstrap
  ZeroWS -->|no| Login
  Auth -->|yes| Workspace
```

## Bootstrap (First Workspace)

**Route:** `/bootstrap`

**File:** [`src/routes/bootstrap.tsx`](../../src/routes/bootstrap.tsx)

When the database has zero workspaces, new users are directed here to:

1. Create an admin account (email/password)
2. Create the first workspace
3. Redirect to the new workspace

Server function: `bootstrapFirstWorkspace` in [`src/lib/workspaces.functions.ts`](../../src/lib/workspaces.functions.ts)

Uses `supabaseAdmin` to bypass RLS for initial setup.

## Login

**Route:** `/login`

**File:** [`src/routes/login.tsx`](../../src/routes/login.tsx)

Supports:

| Method | Implementation |
|--------|---------------|
| Email/password | `supabase.auth.signInWithPassword` |
| Google OAuth | Lovable Cloud Auth → `supabase.auth.setSession` |
| Apple, Microsoft, Lovable OAuth | Same Lovable integration |

After login:
- If user has workspaces → redirect to first workspace
- If user has no workspaces → show "no workspace" dialog

## Invite Flow

**Route:** `/accept-invite?token=...`

**File:** [`src/routes/accept-invite.tsx`](../../src/routes/accept-invite.tsx)

```mermaid
sequenceDiagram
  participant Admin
  participant System
  participant Invitee

  Admin->>System: createInvite(email, role)
  System-->>Admin: Invite link with token
  Admin->>Invitee: Share link
  Invitee->>System: GET /accept-invite?token=...
  alt Not signed in
    Invitee->>System: Sign up or sign in
  end
  Invitee->>System: acceptInvite(token)
  System-->>Invitee: Redirect to workspace
```

Invites:
- Bound to a specific email address
- Expire after 24 hours
- Assign a role (admin, member, viewer) at creation time

Server functions in [`src/lib/invites.functions.ts`](../../src/lib/invites.functions.ts):
- `createInvite` — admin creates invite
- `getInviteByToken` — validate token
- `acceptInvite` — existing user accepts
- `acceptInviteWithSignup` — new user signs up and accepts

## Password Reset

| Route | File | Action |
|-------|------|--------|
| `/forgot-password` | [`forgot-password.tsx`](../../src/routes/forgot-password.tsx) | Send reset email via Supabase |
| `/reset-password` | [`reset-password.tsx`](../../src/routes/reset-password.tsx) | Set new password after reset link |

## Auth State Management

[`src/lib/auth-context.tsx`](../../src/lib/auth-context.tsx) provides `AuthProvider` and `useAuth()` hook for session state across the app.

On auth state change, [`AuthSync`](../../src/routes/__root.tsx) in the root route invalidates router and React Query caches to ensure fresh data.

## Related Docs

- [Auth](../architecture/auth.md) — Token flow and middleware
- [Workspaces & Permissions](workspaces_permissions.md) — Roles after onboarding

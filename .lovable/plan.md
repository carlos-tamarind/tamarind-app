## Goal

Restructure the left side of the workspace shell so the workspace rail is collapsible (resizable), relocate workspace settings, and introduce a per-user profile button + modal at the bottom of the navigation panel.

## Changes

### 1. Workspace rail (the narrow column with workspace tiles)

- **Hidden by default.** On mount, `railOpen` starts `false`.
- **Resizable, not fixed-width.** Replace the current `w-[10%] min-w-[64px]` rail + adjacent `w-[20vw]` aside with a `ResizablePanelGroup` containing:
  - Panel `rail` — visible only when `railOpen`, `defaultSize` ≈ 6, `minSize` 4, `maxSize` 8 (percent of viewport — matches the "8% max" requirement when sliding right).
  - `ResizableHandle` between rail and nav.
  - Panel `nav` — the navigation aside, `defaultSize` ≈ 20, `minSize` 14.
- **Slide-to-close.** `onLayoutChanged` watches the rail size: if it drops below ~3% the user has "slid the divider to the left" → set `railOpen=false` (collapses the rail).
- Keep the central main area (`<main>`) outside this group so the existing conv/page split keeps working unchanged.

### 2. Navigation panel header

- Swap the order: **"Open workspaces panel" button on the left**, workspace name label on the right of the header row.
- The button toggles `railOpen`. Wrap it in `<Tooltip>` with content `"Open workspaces panel"` (uses existing `@/components/ui/tooltip`). Same icon swap as today (`PanelLeftOpen` / `PanelLeftClose`).

### 3. Workspace settings relocation

- Remove the current bottom strip of the nav aside that holds the **Settings** link and Logout button.
- Move the **Settings** link to the **bottom of the rail panel**, separated from the workspace tiles by a top border (`border-t`). Same `Link to="/w/$workspaceId/settings"` target — modal behavior unchanged.
- The rail becomes: tiles list (scrollable, `flex-1`) → divider → Settings button.

### 4. Profile button (replaces the old settings/logout strip at the bottom of the nav)

New bottom row in the nav aside (with `border-t`):

```
[ avatar ]  Display name                    [ logout icon ]
```

- **Avatar**: round, size 8/9. Uses `workspace_users.avatar_url` for the current user if present; otherwise `<Avatar><AvatarFallback><User className="size-4"/></AvatarFallback></Avatar>` (generic persona icon, matches the spec's "generic persona icon by default").
- **Name**: `workspace_users.display_name` for the current `workspaceUserId`, falling back to `auth.user.email`.
- Clicking the avatar+name area opens the profile modal (local `profileOpen` state).
- **Logout button**: existing icon button, now wrapped in `<Tooltip>` content `"Logout"`. Same `supabase.auth.signOut()` + redirect.

Data source: add a tiny server fn `getMyWorkspaceProfile({ workspaceId })` in a new `src/lib/profile.functions.ts` that returns `{ workspaceUserId, displayName, avatarUrl, email }` (joins `workspace_users` row for `auth.uid()` with `auth.users.email`). Mutation `updateMyDisplayName({ workspaceId, displayName })` updates `workspace_users.display_name` for the caller. Both use `requireSupabaseAuth`; the update uses the auth-scoped supabase client so RLS enforces ownership.

### 5. Profile modal (`src/components/profile/profile-dialog.tsx`)

- Rendered inside the workspace shell as a `<Dialog>` (shadcn dialog already dims the background and provides the X close button + outside-click close — matches the spec).
- Content (disposition at our discretion, kept minimal):
  - Centered profile picture (large `Avatar`, generic persona fallback). No upload UI yet.
  - Read-only full name line.
  - **Rename row**: `Input` bound to local state, plus **Cancel** (resets to original) and **Confirm** (calls `updateMyDisplayName`, on success invalidates `["my-profile", workspaceId]` + `["my-workspaces"]`, toast). Change persists only on Confirm.
  - **Bottom-center Logout** primary `Button` labeled `"Logout"`, full-width-ish, calls `supabase.auth.signOut()` then `navigate({ to: "/login" })`.
- Modal closes via outside-click and X (default `DialogContent` behavior — no extra work needed).

### 6. Out of scope (explicitly)

- Avatar upload / image picking.
- Editing email, password, or any auth fields.
- Profile fields beyond display name.
- Any DB schema changes (the `workspace_users.display_name` and `avatar_url` columns already exist).

## Files

- `src/routes/_authenticated.w.$workspaceId.tsx` — rail → resizable panel, header swap + tooltip, relocate settings into rail footer, replace bottom strip with profile button + tooltipped logout.
- `src/components/profile/profile-dialog.tsx` — new.
- `src/lib/profile.functions.ts` — new (`getMyWorkspaceProfile`, `updateMyDisplayName`).

No migrations, no changes to the central conv/page split logic, no changes to existing routes.

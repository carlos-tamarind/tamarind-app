## Goal
Standardize how a workspace user is displayed everywhere: always show **display name → email → "Unknown user"**, and **"Archived user"** when the referenced workspace member no longer exists.

## Single source of truth

Add a small helper used by every server function that resolves a workspace_user reference:

```
resolveUserLabel(workspace_user_row | null, emailLookup) ->
  if row == null                          -> "Archived user"
  else if row.display_name (trimmed)      -> display_name
  else if email for row.user_id           -> email
  else                                    -> "Unknown user"
```

`emailLookup` is built per request by collecting `user_id`s with no display name and calling `supabaseAdmin.auth.admin.getUserById` (same pattern already used in `getConversation` / `listMyConversations`), then memoizing in a `Map<userId,email>`.

A frontend mirror (`formatUserLabel({ displayName, email })`) handles the same fallback for client-built strings (e.g. the new-conversation modal preview), so the rule lives in exactly one client util and one server util.

## Server-side changes (`src/lib/conversations.functions.ts`, `src/lib/pages.functions.ts`)

For every endpoint that returns user-facing names, replace ad-hoc fallbacks (`m.userId.slice(0,8)`, `"Unknown"`, missing email handling) with the helper and ensure the email is fetched when display_name is null:

1. `listWorkspaceMembers` — return `{ workspaceUserId, userId, displayName, email, label }` where `label` is the resolved string. Members come from `workspace_users`, so "Archived user" never applies here.
2. `getConversation` — already builds participant labels; switch to helper, expose `label` on each participant.
3. `listMessages` — currently returns only `authorWorkspaceUserId`. Resolve each distinct author to a label server-side and return it as `authorLabel`. If the author's workspace_users row is missing → `"Archived user"`.
4. `listMyConversations` — switch the default group-title computation to the helper (replaces the inline `"Unknown"` fallback).
5. `getPage` — `ownerDisplayName` becomes `ownerLabel` using the helper (handles deleted owner = "Archived user").
6. `listPageCollaborators` — same: each collaborator gets `label`; missing workspace_users row → "Archived user".

All these endpoints already query `workspace_users`; we just (a) fetch email when display_name is null and (b) detect missing rows for `"Archived user"`.

## Client-side changes

Add `src/lib/user-label.ts`:

```ts
export function formatUserLabel(input: {
  displayName?: string | null;
  email?: string | null;
  archived?: boolean;
}): string {
  if (input.archived) return "Archived user";
  const name = input.displayName?.trim();
  if (name) return name;
  const email = input.email?.trim();
  if (email) return email;
  return "Unknown user";
}
```

Update consumers to render the server-provided `label` (or call `formatUserLabel`) instead of slicing IDs:

- `src/components/conversation/conversation-window.tsx`
  - Message bubble author: `author?.label ?? "Archived user"` (line ~560 currently `"Unknown"`).
  - Mention suggestion list: use `label`.
  - Participants list: use `label`.
- `src/components/new-conversation-dialog.tsx` — replace `m.displayName ?? m.userId.slice(0, 8)` with `formatUserLabel(m)` (now that `email` is returned).
- `src/components/conversation/add-participants-dialog.tsx` — same replacement.
- `src/components/conversation/conversation-settings-dialog.tsx` — render `p.label`.
- `src/components/page/page-window.tsx`
  - Owner display (line ~159): use `ownerLabel`.
  - Mention suggestions (line ~166): use `label` from `listWorkspaceMembers` (no more `userId.slice`).
  - Presence avatars / collaborator chips: use `label`.
- `src/components/page/page-settings-dialog.tsx` — Collaborators section uses `c.label`.

Mention nodes (`MemberMention`) already display `label` from the attrs — no schema change there; we just feed them the resolved string when constructing suggestion items.

## Edge cases covered
- Display name is an empty/whitespace string → falls through to email.
- User row exists but `auth.admin.getUserById` fails or returns no email → "Unknown user".
- workspace_user row deleted (FK was nullable / row hard-deleted) → "Archived user" for messages, page owners, collaborators.
- Current user (`isMe`) keeps the same resolution; no special-casing.

## Out of scope
- No schema changes (no soft-delete column added; "Archived" is inferred from a missing join).
- No change to how avatars are resolved.
- Historical mention chips already stored in TipTap docs keep whatever label they were saved with; this only affects newly rendered UI and freshly inserted mentions.
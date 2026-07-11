# Page visibility rules

Align the new-page dialog, page-settings dialog, and the `setPageVisibility` server function with the rules you described. The Pages list already relies on RLS, which already matches ("my private" + "workspace" + "conversations I participate in"), so no listing changes needed.

## 1. New page dialog (`src/components/page/new-page-dialog.tsx`)

Visibility select behavior:

- Outside a conversation (no `conversationId`): options are **Private** (default) and **Workspace**. **Conversation** is rendered as a disabled item so users see it exists but can't pick it.
- Inside a conversation: default and only enabled option is **Conversation**. **Private** and **Workspace** are rendered as disabled items.

Implementation: always render all three `SelectItem`s, mark the non-applicable ones `disabled`, and pin the default in `useEffect` accordingly. Drop the current "workspace switch" branch inside conversations.

## 2. Page settings dialog (`src/components/page/page-settings-dialog.tsx` + `page-window.tsx`)

Replace the current "conversation → read-only box, else Private/Workspace select" logic with a single always-rendered Select whose items are enabled/disabled per rules:

- `visibility === "private"` and viewer is the owner: **Private** selected, **Workspace** enabled (promote), **Conversation** disabled.
- `visibility === "private"` and viewer is not the owner: all options disabled (safety).
- `visibility === "workspace"`: **Workspace** selected, **Private** and **Conversation** disabled (locked).
- `visibility === "conversation"`: **Conversation** selected, **Private** and **Workspace** disabled (locked).
- `visibility === "external"`: leave as today (all disabled).

Pass `isOwner` (compare `ownerWorkspaceUserId` with current workspace user) from `page-window.tsx` into the dialog to gate the Private→Workspace promotion. The existing `onVisibilityChange` signature (`"private" | "workspace"`) stays; it will only ever be called for the Private→Workspace transition.

Helper text under the select when locked:

- Workspace pages: "Visibility on Workspace pages cannot be changed back. Duplicate to make a private copy."
- Conversation pages: "Visibility on Conversation pages cannot be changed. Duplicate to make a private copy."

## 3. Server enforcement (`src/lib/pages.functions.ts`)

Harden `setPageVisibility` so the UI rules can't be bypassed:

- Load the page's current `visibility`, `owner_workspace_user_id`, `workspace_id`.
- Resolve the caller's workspace_user_id via `getCurrentWorkspaceUser`.
- Allow **only** `private → workspace` when the caller is the owner. Reject everything else with a clear error (`"Only the owner can promote a private page to workspace"` / `"This page's visibility is locked"`).

`createBlankPage` already restricts input to `private | workspace` — fine. `createConversationPage` / `createPageFromMessages` already force `conversation` (or `workspace` when explicitly chosen at creation time); no change.

## 4. Out of scope

- Page duplication (private copy of a conversation/workspace page) — tracked for later per your note.
- No DB migration; existing RLS already matches the listing rules.

## Technical notes

- shadcn `SelectItem` supports `disabled`; the trigger still shows the selected value even if that item is disabled.
- `PageVisibility` type stays as-is; only the dialog's rendering logic changes.
- Server errors from `setPageVisibility` should be surfaced via the existing toast/error path in `page-window.tsx`.

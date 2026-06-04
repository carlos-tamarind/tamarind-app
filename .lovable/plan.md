# Split panel + page header redesign

## 1. URL model: search params instead of nested routes

Today, opening a conversation or a page navigates to a nested route under `/w/$workspaceId`, and only one can render at a time (via `<Outlet />`). To show both simultaneously and independently, switch to **search params on the workspace route**:

```
/w/<workspaceId>?c=<conversationId>&p=<pageId>
```

- `c` → which conversation is open in the left window (optional)
- `p` → which page is open in the right window (optional)
- Both, one, or neither may be set.
- Switching a conversation/page never affects the other param — true independence.

The existing path-based routes `/w/$workspaceId/c/$conversationId` and `/w/$workspaceId/p/$pageId` are kept as **thin redirect routes** that forward to the search-param form, so existing links (mentions, invites, bookmarks) continue to work.

## 2. Central panel layout

In `src/routes/_authenticated.w.$workspaceId.tsx`, replace `<Outlet />` with a `ResizablePanelGroup` (`react-resizable-panels`, already in the project) that renders:

- **Conversation window** (left) when `c` is set — wraps the current conversation view, refactored to take `conversationId` as a prop.
- **Page window** (right) when `p` is set — wraps the current page view, refactored to take `pageId` as a prop.
- A draggable `ResizableHandle` between them, shown only when both are open.
- When only one is open, it takes the full central panel.
- When neither is open, the index empty state renders (current `_authenticated.w.$workspaceId.index.tsx` content).

### 20 % collapse threshold

Wire an `onLayout` callback on the panel group:

- If both panels are visible and the conversation panel drops below 20 % of the central panel width → clear the `c` search param (page expands to full width).
- If both are visible and the page panel drops below 20 % → clear `p` (conversation expands).

## 3. Component refactor

- Extract the body of `ConversationView` into `src/components/conversation/conversation-window.tsx` that accepts `{ workspaceId, conversationId }` as props (no `useParams`). The existing route file becomes a redirect-only route.
- Extract the body of `PageView` into `src/components/page/page-window.tsx` accepting `{ workspaceId, pageId }`. The existing route file also becomes a redirect-only route.
- Sidebar links (`src/routes/_authenticated.w.$workspaceId.tsx`) and any internal navigation (mentions in editor, `ConversationSettingsDialog`, etc.) are updated to set search params instead of pushing to nested routes — using `navigate({ to: '/w/$workspaceId', params, search: (prev) => ({ ...prev, c: id }) })`.
- Sidebar `<Link>` for items uses the `activeProps` pattern by checking `search.c === c.id` (small custom helper).

## 4. Page header redesign

Replace the current top row (visibility `Select` + presence avatars) with a thin header section separated by a `Separator`:

- **Visibility icon-button** (far right area): a `Button variant="ghost" size="icon"` showing the icon for the current visibility (`Lock` private / `Globe` workspace / `MessageSquare` conversation). Click opens a `DropdownMenu` with the same options that exist today (Private + Workspace; Conversation appears in the dropdown only when already in that state — it cannot be set manually).
- **3-dot button**: opens a new `PageSettingsDialog` with:
  1. Page title (editable input)
  2. Page owner (display name of `owner_workspace_user_id`)
  3. "Who can see this page?" + visibility selector (same control as above)
  4. Collaborators — list of workspace users that have edited the page at least once

Presence avatars move into this thin header strip too (kept, just relocated).

## 5. Conversation visibility icon

Add `MessageSquare` (lucide) as the visual for `visibility = "conversation"`:
- In the new page-header visibility button.
- In the sidebar pages list (currently only renders Lock/Globe; add the conversation case).

## 6. Collaborators tracking (new table)

Add a `page_collaborators` table to record who has edited a page:

- `page_id` (fk → `pages.id`, on delete cascade)
- `workspace_user_id` (fk → `workspace_users.id`, on delete cascade)
- `first_edited_at`, `last_edited_at`
- PK = (page_id, workspace_user_id)
- RLS: read allowed to anyone who can read the page; insert/update via `SECURITY DEFINER` upsert helper.
- Standard GRANTs (`SELECT` for `authenticated`, `ALL` for `service_role`).

Server-side wiring:

- `updatePage` upserts a `page_collaborators` row for the current workspace user on every save.
- `getPage` extends its response with `ownerDisplayName` and `collaborators: [{ workspaceUserId, displayName, lastEditedAt }]`. The page owner is always included even if they never edited (seeded once at page creation).

## 7. Out of scope

- Opening multiple conversations or multiple pages at once.
- Persisting split-pane size across reloads.
- Mobile responsive layout for the split (single-pane fallback can come later).
- Real "viewed by" tracking — only **edits** populate collaborators for MVP.

## Files touched

- New migration: `page_collaborators` table + RLS + GRANTs.
- New: `src/components/conversation/conversation-window.tsx`
- New: `src/components/page/page-window.tsx`
- New: `src/components/page/page-settings-dialog.tsx`
- Edited: `src/lib/pages.functions.ts` (extend `getPage`, upsert in `updatePage`, new `listPageCollaborators` if needed)
- Edited: `src/routes/_authenticated.w.$workspaceId.tsx` (split panel, search params, sidebar links, conversation visibility icon)
- Edited: `src/routes/_authenticated.w.$workspaceId.c.$conversationId.tsx` (redirect-only)
- Edited: `src/routes/_authenticated.w.$workspaceId.p.$pageId.tsx` (redirect-only)
- Edited: any mention-click handlers that navigate between conversations/pages.

## Token estimate

~35–45k tokens including the migration approval round-trip and QA.

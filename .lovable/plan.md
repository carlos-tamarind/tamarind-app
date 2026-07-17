## Duplicate Page feature

Adds a "Duplicate" action to the page visibility dropdown menu (VDM) that creates an independent copy of the current page with a chosen title and visibility, then navigates to the new page.

### 1. Server: `duplicatePage` server function

New export in `src/lib/pages.functions.ts` (`duplicatePage`, `createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])`).

Input (zod):
- `pageId: uuid` — source page
- `title: string` (trimmed, max 500, min 1)
- `visibility: "private" | "workspace" | "conversation"`
- `workspaceUserIds: uuid[]` (default `[]`) — only used when `visibility === "conversation"`
- `conversationIds: uuid[]` (default `[]`) — only used when `visibility === "conversation"`
- Refine: if `visibility === "conversation"`, at least one user or conversation is required.

Handler steps (using `supabaseAdmin` after resolving the caller):
1. Load source page (`id, title, content, workspace_id`) via `supabaseAdmin`; caller must be able to read it — verify by calling `assertCanEditPage` OR by falling back to a read via `context.supabase` (any user that can view the page can duplicate it — check via `context.supabase.from("pages").select("id").eq("id", pageId).maybeSingle()`). Reject if not visible.
2. Resolve `meWuId = getCurrentWorkspaceUser(source.workspace_id, context.userId)`. The new page's owner is `meWuId`, not the source owner.
3. Insert new page into `pages` copying `content` from source and using the supplied `title`, with:
   - `workspace_id = source.workspace_id`
   - `created_by_workspace_user_id = meWuId`
   - `owner_workspace_user_id = meWuId`
   - `page_type = "standard"`, `origin_type = "user"`
   - `visibility`:
     - `"private"` → `visibility = "private"`, `conversation_id = null`
     - `"workspace"` → `visibility = "workspace"`, `conversation_id = null`
     - `"conversation"` → `visibility = "conversation"`, `conversation_id = <first resolved conversation id>` (see step 4)
4. When `visibility === "conversation"`, reuse the same target-resolution logic as `sharePage` (resolve/create 1:1 conversations for `workspaceUserIds`, validate group `conversationIds`, dedupe). Then, for the new page id:
   - Post the same "Hey! I just shared this page…" announcement message into every target conversation and bump `conversations.last_modified_at`.
   - Upsert `page_collaborators` rows for every unique participant of every target conversation, minus `meWuId` (owner already has access).
5. Return `{ pageId: <new id> }`.

Extract the "resolve target conversations + post announcement + upsert collaborators" block from `sharePage` into a helper in `src/lib/pages.server.ts` (`shareToConversations({ pageId, workspaceId, ownerWuId, meWuId, workspaceUserIds, conversationIds })`) and call it from both `sharePage` and `duplicatePage` — behavior of `sharePage` is unchanged. No visibility mutation happens inside the helper; `sharePage` still applies its own `private → conversation` promotion.

### 2. UI: `DuplicatePageDialog` component

New file `src/components/page/duplicate-page-dialog.tsx`, structurally similar to `share-page-dialog.tsx`. Props: `{ open, onOpenChange, pageId, workspaceId, currentTitle }`.

State:
- `titleInput: string` (initialized to `""`; placeholder shows `"{currentTitle} (duplicate)"`; submitted value defaults to the placeholder when the field is left empty)
- `visibility: "private" | "workspace" | "conversation" | null`
- `selectedUsers`, `selectedConvs` (only used when `visibility === "conversation"`)
- `confirmOpen`, `busy`

First modal (`Dialog`):
- Title: **Duplicate page**
- Section 1 — **Rename**: single text input with placeholder `"{currentTitle} (duplicate)"`.
- Section 2 — **Visibility**: three mutually exclusive toggle-buttons (`Private`, `Conversation`, `Workspace`) using the existing `Button` component with `variant` swapped between `default` (selected) and `outline` (unselected).
- When `visibility === "conversation"`: render the same two Collapsibles used in `SharePageDialog` (workspace members and group conversations), fed by `listWorkspaceMembers` and `listMyConversations` (both already used by share dialog).
- Footer: **Cancel** (secondary, left) + **Continue** (primary, right).
  - Continue disabled when `visibility === null`, or `visibility === "conversation"` and no user/conversation is selected.
- Closing via Esc / backdrop aborts (resets state, calls `onOpenChange(false)`).

Second modal (confirmation `Dialog`, sibling to the first — first stays mounted underneath):
- Title: **Duplicate page**
- Body text switches on selected visibility:
  - Private → `"Are you sure you want to create a copy of this page?"`
  - Conversation → `"Are you sure you want to share a copy of this page with the selected users?"` + the same two summary boxes used in `SharePageDialog`'s confirmation (selected user labels, selected group labels).
  - Workspace → `"Are you sure you want to publish a copy of this page with the whole workspace?"`
- Footer: **Cancel** (closes confirmation only, keeps first modal open) + **Confirm** (primary).
- Backdrop / Esc closes confirmation only.

Confirm handler:
- Calls `duplicatePage({ data: { pageId, title: titleInput.trim() || `${currentTitle} (duplicate)`, visibility, workspaceUserIds, conversationIds } })`.
- On success: toast, invalidate `["pages-list", workspaceId]` and (for conversation copies) affected conversation caches, close both dialogs, then navigate to the new page: `navigate({ to: "/w/$workspaceId", params: { workspaceId }, search: (prev) => ({ ...prev, p: res.pageId }) })`.

### 3. Wire into `page-window.tsx`

- Import `DuplicatePageDialog` and `useState` flag `duplicateOpen`.
- Replace the current `TODO: Duplicate` `DropdownMenuItem` `onSelect` with `setDuplicateOpen(true)` and keep the `Copy` icon + label. Item stays **always available** (no visibility guard).
- Add tooltip via `title="Creates a copy of this page and also lets you share it with other users"`.
- Render `<DuplicatePageDialog ... currentTitle={title || "Untitled"} />` alongside the existing dialogs, passing `pageId`, `workspaceId`.
- Before opening the duplicate dialog, ensure the current in-progress edits are flushed (call `flushNowRef.current({ silent: true })`) so the duplicate reflects the latest content. If flush fails, still open the dialog — the source hasn't been modified server-side yet.

### 4. Version

Bump `src/lib/version.ts` to `0.1.28`.

### Notes / non-goals

- No schema changes. Uses existing `pages`, `page_collaborators`, `conversations`, `conversation_participants`, `messages` tables and their existing RLS.
- No changes to `sharePage`'s external behavior — only an internal refactor to share the "resolve conversations + fan-out" helper.
- Workspace-visibility duplicates do not create `page_collaborators` rows (workspace visibility already grants read/edit to all workspace members via existing policies, matching the current Publish behavior).

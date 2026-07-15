## Add "Share page" to the Visibility Dropdown Menu

Follow-up to the VDM revamp. Wires the existing `Share` item to a new modal + confirmation flow, and adds a backend server fn that grants collaborator access, announces the share in a conversation, and promotes visibility.

### Visibility rule (explicit)

- **A private page shared with other users has its visibility changed to "Conversation".**
- **A page that already has "Conversation" visibility keeps it as-is.**
- Workspace / external pages cannot be shared (Share item is hidden).

### 1. VDM Share item

`src/components/page/page-window.tsx`:
- Render Share `DropdownMenuItem` only when `visibility === "private" || visibility === "conversation"` (hidden on `workspace` / `external`).
- Icon: swap `Share2` → lucide `MessageSquareShare`.
- `title` tooltip: "Shares this page with other users or groups".
- `onSelect` → `setShareOpen(true)`.

### 2. Share modal — step 1

New component `src/components/page/share-page-dialog.tsx`.
- Title: "Share page".
- Two collapsible sections:
  - **Share with specific users:** rows from `listWorkspaceMembers({ workspaceId })`, excluding current user. Checkbox + display label.
  - **Share with entire group conversations:** rows from `listMyConversations({ workspaceId })` filtered to `type === "group"`. Checkbox + conversation title.
- Footer: `Cancel` (secondary), `Continue` (primary, disabled while total selection is 0).
- Backdrop / Esc / Cancel closes and clears selection.
- `Continue` opens a nested confirmation dialog; share dialog stays open behind it.

### 3. Confirmation modal — step 2

Rendered inside `SharePageDialog` as a second `<Dialog>` with `confirmOpen` state.
- Title: "Share page".
- Body: "Are you sure you want to share this page with the selected users?".
- Section "Users:" — comma-joined display names (omit if none).
- Section "Conversations:" — comma-joined conversation titles (omit if none).
- Footer: `Cancel` closes only the confirmation. `Confirm` calls `sharePage`, on success closes both and toasts "Page shared".
- Backdrop click closes only the confirmation.

### 4. `sharePage` server function

Add to `src/lib/pages.functions.ts` (`requireSupabaseAuth`, `supabaseAdmin` loaded inside handler).

Input:
```
{ pageId: uuid, workspaceUserIds: uuid[] = [], conversationIds: uuid[] = [] }
```
Rejects when both arrays are empty. Rejects when page visibility is `workspace` or `external`.

Handler:
1. Load page: `id, title, workspace_id, visibility, owner_workspace_user_id, conversation_id`.
2. Resolve `meWuId` via `getCurrentWorkspaceUser`.
3. **Resolve target conversations** into a deduped list `targets: { conversationId, participants: string[] }[]`:
   - For each `workspaceUserId`: reuse `findOrCreateConversation`'s core (extract shared helper into `src/lib/conversations.server.ts`) for the 1:1 conversation with `[meWuId, targetWuId]`.
   - For each `conversationId`: assert current user is a participant AND `conversations.type === 'group'`. Reject unknown/non-group.
   - Dedupe conversation ids across both sources.
   - Fetch each conversation's full participant list.
4. **Promote visibility** — enforce the rule stated above:
   - If page is `private` → update to `visibility='conversation'`, set `conversation_id` to the first target conversation (single FK is a schema constraint; the page still appears with "Conversation" visibility for all collaborators).
   - If page is already `conversation` → leave `visibility` and `conversation_id` untouched.
5. **For every target conversation** (always — the confirmation message is mandatory, even when the target user was already a collaborator):
   - Post announcement message. Extend `postPageAnnouncementMessage` in `src/lib/conversations.functions.ts` with a `leadText` param (or add sibling `postPageShareMessage`), keeping existing "just created" call site unchanged. HTML: `<p>Hey! I just shared this page with you:</p><p><span class="mention-page" data-id="{pageId}" data-label="{TITLE}">TITLE</span></p>`.
   - Bump `conversations.last_modified_at`.
6. **Upsert collaborators**: union of participants across all targets, excluding `owner_workspace_user_id`, upsert into `page_collaborators` with `onConflict: 'page_id,workspace_user_id', ignoreDuplicates: true`. Enforces the "no duplicate collaborator" rule; already-collaborators become a silent no-op while step 5 still fires.
7. Return `{ ok: true, conversationIds: string[] }`.

Notes:
- Collaborator status grants editor access via existing `assertCanEditPage` conversation path once the page is `visibility='conversation'`. Before implementing, view `pages` SELECT RLS policies — if they don't already expose `visibility='conversation'` pages to users listed in `page_collaborators`, include a migration in the same change that OR's in `EXISTS(page_collaborators … workspace_user_id = current wu)`. Required so the shared page shows up in the Pages nav for user B.

### 5. Client wiring

- Add `shareOpen` state next to `publishOpen` in `page-window.tsx`.
- Render `<SharePageDialog open={shareOpen} onOpenChange={setShareOpen} pageId workspaceId pageTitle />`.
- On confirm success: `useServerFn(sharePage)` → invalidate `["page", pageId]`, `["pages-list", workspaceId]`, `["conversations-list", workspaceId]`, and `["conversation-messages", cid]` for each returned conversation.

### 6. Version bump

`src/lib/version.ts`: `0.1.25` → `0.1.26`.

### Out of scope

- Duplicate item stays no-op.
- Trigger icon, Publish flow, PageSettingsDialog: unchanged.

### Acceptance-criteria mapping

- Private → shared ⇒ visibility becomes **Conversation** (step 4).
- Already-Conversation page stays Conversation (step 4).
- B becomes a collaborator (step 6 upsert).
- Already-a-collaborator ⇒ only the message is sent (step 5 always runs; step 6 ignoreDuplicates is a no-op).
- Confirmation message is mandatory (no early return in step 5).
- No duplicate collaborator rows (unique index + ignoreDuplicates).
- Collaborator = editor for both A and B; page shows as "Conversation" in the nav for both (step 4 + RLS check).
- Group share posts message in the group + makes all participants collaborators (steps 5 + 6 with full participant list).

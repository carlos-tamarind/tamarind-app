## Show conversation creator in the settings dialog

Good news: the `conversations` table already has a `created_by_workspace_user_id` column, so **no DB migration is needed**.

### 1. `src/lib/conversations.functions.ts` — `getConversation`
- Add `created_by_workspace_user_id` to the `conversations` select.
- Resolve the creator's label reusing the existing pattern (`workspace_users` lookup + `fetchEmailsForUserIds` + `resolveLabel`). If the creator is already among the participants, reuse that label; otherwise fetch that single workspace user (they may have left the conversation).
- Return a new field `createdBy: { workspaceUserId, label } | null` (null if the column is empty for legacy rows).

### 2. `src/components/conversation/conversation-settings-dialog.tsx`
- Accept a new prop `createdBy: { label: string } | null`.
- Insert a new section **between the name block and the Participants section**:
  - `<h3 className="text-sm font-semibold">Created by</h3>`
  - A read-only block matching the styling of Participants/Pages lists (`rounded-md border bg-muted/30 p-2 text-sm`) showing the creator label, or "Unknown" when null.
- No edit affordance.

### 3. `src/components/conversation/conversation-window.tsx`
- Pass the new `createdBy` value from `getConversation` through to `ConversationSettingsDialog`.

### Bump `APP_VERSION`
- Bump `src/lib/version.ts` `APP_VERSION` per the patch rule.

### Out of scope
- DB migration (column already exists).
- Backfilling creator for legacy conversations that have `null`.
- Any permission changes — creator remains purely informational.

# Unread messages: database groundwork

Add the supporting index and RPC that return unread-message counts per conversation, required before the app can implement unread badges.

## Verified current state

- `conversation_participants.last_read_at` already exists (`timestamptz NOT NULL DEFAULT now()`).
- `public.messages` already has `purged_at` and existing btree indexes on `(conversation_id, created_at)`.
- `public.get_unread_conversation_summary_for_user` does **not** exist yet.

## Migration

One migration with three objects:

1. **Partial index** `idx_messages_conversation_unread` on `messages(conversation_id, created_at) INCLUDE (author_workspace_user_id) WHERE purged_at IS NULL`.
   - Speeds up the unread lookup while matching the search/CTI convention of ignoring purged messages.
2. **RPC** `public.get_unread_conversation_summary_for_user(p_workspace_id uuid, p_workspace_user_id uuid)`.
   - Returns `conversation_id`, `unread_count`, `oldest_unread_message_id`, `newest_unread_message_id`.
   - Counts messages in the user's conversations where `purged_at IS NULL`, author is not the viewer (`IS DISTINCT FROM`), and `created_at > last_read_at`.
   - `SECURITY INVOKER`, `STABLE`, `search_path = public`.
3. **Grants**:
   - `GRANT EXECUTE ... TO authenticated;`
   - `GRANT EXECUTE ... TO service_role;` — required because the app calls this through `supabaseAdmin` (service role), where `auth.uid()` is NULL.

No table changes, so no new GRANT/RLS work is needed.

## Supabase types

After the migration executes, `src/integrations/supabase/types.ts` will be regenerated automatically. Verify that the new function signature appears; no manual edits are expected.

## Documentation updates

Update `docs/architecture/database.md`:

- Add `idx_messages_conversation_unread` to the **Key Indexes** table.
- Add `get_unread_conversation_summary_for_user` to the **Database Functions** table, noting it is used by service-role server functions with an explicit `p_workspace_user_id`.
- Add a 2026-09-03 entry to the **Migration Timeline**.

## Out of scope

- No application code changes.
- No UI for unread badges.
- No `mark-as-read` RPC (a direct `UPDATE` on `conversation_participants.last_read_at` is sufficient).
- No version bump.

## Acceptance criteria

- Migration applies cleanly.
- `get_unread_conversation_summary_for_user` is callable by both `authenticated` and `service_role`.
- `src/integrations/supabase/types.ts` reflects the new function.
- `docs/architecture/database.md` documents the index and function.

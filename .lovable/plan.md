# Enforce visibility on canonical topics (database only)

## Current state (checked)
- `canonical_topics`: one SELECT policy for `authenticated` — `is_workspace_member(workspace_id)`.
- `canonical_topic_evidences`: one SELECT policy — the parent topic's workspace membership.
- `can_read_page(page_id)` checks workspace membership and visibility (workspace / external / private owner / conversation participant or collaborator), but **does not check `purged_at`**.
- `is_conversation_participant(conversation_id)` checks the caller's participant row.

## Change
One migration in `supabase/migrations/` (timestamped .sql, no Drizzle):

1. New helper `public.can_read_evidence_owner(_source_type text, _owning_entity_id uuid) returns boolean` — `STABLE SECURITY DEFINER`, `search_path = public`:
   - `page_topic` -> `can_read_page(id)` AND the page's `purged_at IS NULL`
   - `conversation_topic` -> `is_conversation_participant(id)`
   - any other / unknown source type -> `false` (fail closed)
2. New helper `public.can_read_canonical_topic(_topic_id uuid) returns boolean` — `STABLE SECURITY DEFINER`:
   - topic's workspace passes `is_workspace_member`, AND
   - `NOT EXISTS` an evidence row of that topic where `can_read_evidence_owner(...)` is false.
3. Replace policies (drop + recreate, same names kept for clarity):
   - `canonical_topics` SELECT to `authenticated`: `USING (public.can_read_canonical_topic(id))`
   - `canonical_topic_evidences` SELECT to `authenticated`: `USING (public.can_read_canonical_topic(canonical_topic_id))`
   - `service_role` access and the existing grants unchanged; still no INSERT/UPDATE/DELETE for `authenticated`.
4. `REVOKE EXECUTE ... FROM PUBLIC, anon` on both helpers; `GRANT EXECUTE` to `authenticated, service_role`.
5. Supporting index on `canonical_topic_evidences (canonical_topic_id, source_type, owning_entity_id)` if not already covered, so the per-topic check stays cheap.

Policies call security-definer helpers, so there is no RLS recursion between the two tables.

6. Fix the `page_topics` DELETE trigger (`enqueue_page_topic_canonical_job`). When a page is hard-deleted, its topics are deleted along with it. By then the page row is already gone, so the workspace lookup returns NULL and the job insert hits the NOT NULL check, which likely blocks hard-deleting purged pages that have topics. Fix: if the page's workspace is NULL, get it from the canonical topic linked to an existing evidence row for `OLD.id`. If no evidence exists, skip enqueueing because there is nothing to remove.

## After migration
- Regenerate Supabase types.
- Update `docs/semantic/canonical_topics.md` (Access Control + Job Lifecycle) and the canonical-topics section of `docs/architecture/database.md`.
- Verify with SQL: a member who can't access one evidence's page/conversation cannot see the topic or its evidence rows. A member with full access sees both. A purged page hides the topic. Hard-deleting a page that has topics succeeds.
- Version stays at 0.3.258 (set by the branch commit), no bump.

## Status of previously flagged app gaps (checked against de58f67)
- Commit `de58f67` (merge of `claude/knowledge-base`) makes the change as described. `listCanonicalTopics` and `getCanonicalTopicEvidence` now read through the caller's own session, and purged pages are skipped in the evidence previews. Version reads 0.3.258.
- **This commit is not in the project yet.** The current project is still at 0.3.257 and still uses the admin client. It needs to be synced or merged into this project before or alongside this migration. The combination only works when both are present.
- After both are in: the database rule and the server functions enforce the same visibility, so both flagged gaps are closed.

## Still flagged, not tackled (need app changes or a separate decision)
- `assertWorkspaceMember` still uses the admin client. This is harmless because it only checks membership, but it is redundant once RLS applies.
- **All-or-nothing rule**: one private evidence hides the whole topic from everyone else. This follows the premise, but the Knowledge Base may later want a partial view. That is a product decision.
- **`can_read_page` ignores `purged_at`** for pages, chunks and topics generally. This is outside this task and worth a separate review.
- **Performance**: the check runs per row, so large workspaces may later need a set-based RPC.

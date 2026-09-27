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

## After migration
- Regenerate Supabase types.
- Update `docs/semantic/canonical_topics.md` (Access Control section) and the canonical-topics part of `docs/architecture/database.md` to describe the new rule and helpers.
- Verify with SQL: as a member lacking access to one evidence's page/conversation, the topic and its evidence rows are hidden; as a member with access to all, visible; purged page hides the topic.
- Bump version to 0.3.258 is an app change — skipped unless you want it.

## Flagged, not tackled (need app changes)
- **Server functions bypass this.** `listCanonicalTopics` and `getCanonicalTopicEvidence` read with the admin client and only check workspace membership, so they still return every topic. They should switch to the caller's client (`context.supabase`) so RLS applies — required before the Knowledge Base UI uses them.
- **`getCanonicalTopicEvidence` snapshot lookups** read `conversation_topics` / `page_topics` via admin; even after the switch these need a per-source visibility check.
- **All-or-nothing rule hides widely-shared topics**: one private evidence hides the whole topic from everyone else. Intended per the premise, but the KB may later want a "partial view" (show topic, hide unreadable evidence) — a product decision.
- **`can_read_page` ignores `purged_at`** everywhere else too (pages, chunks). Fixing it globally is outside this task; worth a separate review.
- **Performance**: the check is evaluated per row; listing large workspaces may need a set-based RPC later.

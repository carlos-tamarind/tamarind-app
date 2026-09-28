# Knowledge-Base graph: move visibility + similarity into one database call

## Verdict
Implement the proposal largely as written, with the small, justified changes listed below. One migration, types regen, docs. No app code changes.

## What the database already has (checked)
- `can_read_page_as(page, wu)` and `is_conversation_participant_as(conv, wu)` exist; `search_pages_semantic_for_user` is the precedent (SECURITY DEFINER, service_role only).
- Index `canonical_topic_evidences(source_type, owning_entity_id)` already exists (added in the previous task). No new evidence index needed.
- `conversation_participants` primary key is `(conversation_id, workspace_user_id)`, which already serves the participant lookup. No new index needed.

So the "supporting indexes" section of the proposal is already satisfied; the migration adds none.

## Migration (supabase/migrations/<timestamp>_canonical_topic_graph_for_user.sql)

1. `is_canonical_topic_visible_for_user(p_workspace_user_id, p_topic_id) RETURNS boolean` — single source of the visibility premise:
   - the workspace user belongs to the topic's workspace;
   - at least one evidence exists;
   - no evidence whose owner is unreadable: conversation → not participant; page → not `can_read_page_as`, or `purged_at IS NOT NULL`, or page row missing; unknown source type → hidden (fail closed).
2. `get_canonical_topic_graph_for_user(p_workspace_user_id, p_workspace_id, p_max_nodes 400, p_neighbors 5, p_min_similarity 0.3) RETURNS jsonb` — `{ nodes, context_edges, semantic_links }`, computed in one statement (one snapshot):
   - `visible`: topics in the workspace passing the predicate above (inlined as NOT EXISTS for set-based planning, same logic as step 1).
   - `kept`: top `p_max_nodes` by `evidence_count DESC, id`.
   - `nodes`: id, name, description, evidence_count, `last_activity_at = COALESCE(last_evidence_at, updated_at)`. No embeddings.
   - `context_edges`: kept-topic pairs sharing an owning entity, `a.id < b.id`, weight = distinct shared owners.
   - `semantic_links`: LATERAL top-`p_neighbors` by cosine distance within `kept`, similarity = 1 − distance, filtered by `p_min_similarity`, deduped with LEAST/GREATEST.
3. Both functions: `SECURITY DEFINER`, `STABLE`, `SET search_path = public`; REVOKE from PUBLIC/anon/authenticated; GRANT EXECUTE to service_role only.

### Changes vs. the proposal (and why)
- **Input clamping:** `p_max_nodes` clamped to 1..1000, `p_neighbors` to 1..20, `p_min_similarity` to 0..1. Protects the brute-force 400² scan from an accidental huge value.
- **Membership check inside the function:** if `p_workspace_user_id` is not a member of `p_workspace_id`, return empty arrays. Defence in depth in case a caller passes mismatched ids.
- **Context edges from both sources, not only conversations:** a page-topic pair sharing a page is equally real co-occurrence. Output adds `kind` (`conversation` / `page`) so the UI can ignore pages if wanted. If you prefer conversation-only exactly as proposed, say so and I drop it.
- **No persisted 2D coordinates:** the summary mentions them but the RPC spec does not. Storing layout needs a new column plus a job to compute it; out of scope here, flagged below.
- **Predicate shared in one helper** (step 1) so the evidence endpoint and the graph cannot drift apart.

## After the migration
- Regenerate database types.
- Verify with SQL: a member sees only topics whose evidence they can all read; a topic with one private/purged evidence disappears; non-member gets empty output; anon/authenticated cannot execute.
- Docs: `docs/semantic/canonical_topics.md` (new "Graph RPC" section + access control) and `docs/architecture/database.md` (RPC reference).
- No version bump (no app change).

## Flagged for app changes (not tackled)
- `getKnowledgeGraph` should replace its multi-step JS pipeline with one `supabaseAdmin.rpc("get_canonical_topic_graph_for_user", …)`, resolving `meWuId` server-side, and map to camelCase.
- `getKnowledgeTopicEvidence` can drop its JS filter and call `is_canonical_topic_visible_for_user`.
- Persisted 2D layout (column + worker) if load-time layout cost becomes an issue.
- Stale text: topics flagged `needs_regeneration` are still returned; consider hiding them until regenerated (could be added to the predicate on request).

## Technical notes
- Migration file lives only in `supabase/migrations/`; any tool-generated drizzle files are moved and removed, no packages added.

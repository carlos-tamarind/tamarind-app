# Message delete with 1-hour Undo — database round

Scope: database migrations, docs, and regenerated `types.ts` only. No app/worker/UI code (the app agent owns sections 1–4 of the source plan).

## Confirmed current state

- `messages.purged_at`, `idx_messages_purged_at`, registry row `('message','messages',10)` and `purge_due_entities` already exist.
- `purge_due_entities` today runs one generic `DELETE ... RETURNING` per registry row — messages would be hard-deleted, destroying the placeholder.
- `search_messages_keyword` and `search_messages_semantic` join `messages` with no `purged_at` filter; `search_messages_semantic_for_user` wraps the semantic one, so a single fix covers it.
- `cti_is_next_processable` counts any earlier message with an unfinished job (or in-flight semantics) as a blocker, with no `purged_at` exception; `claim_conversation_topic_job` loops candidates and defers to that function.

## 1. Scrub-not-delete for messages

Rewrite `purge_due_entities` (same signature, `SECURITY DEFINER`, `search_path = public`, service_role only, same `(entity_type, id)` return shape). It keeps walking `purgeable_entity_types` in `purge_order`; per row it picks a strategy:

- `entity_type_key = 'message'` → scrub branch:
  1. collect due ids (`purged_at IS NOT NULL AND purged_at <= now()`, optionally intersected with `p_entity_ids`)
  2. `DELETE FROM conversation_topic_evidences WHERE message_id = ANY(ids)`
  3. `DELETE FROM conversation_topic_jobs WHERE message_id = ANY(ids)`
  4. `DELETE FROM message_semantics WHERE message_id = ANY(ids)` (embeddings cascade)
  5. `UPDATE messages SET raw_text = '' WHERE id = ANY(ids)` — id, conversation, author, created_at, purged_at untouched; `entities` registry row survives
  6. return the ids
- every other type → the existing generic `DELETE` branch (pages stay hard-delete)

Strategy is driven by the registry key, not by hardcoded table names in the delete path — adding a future scrubbable type stays a registry + branch-table decision rather than a rewrite.

## 2. Hide trashed messages from search

Add `AND m.purged_at IS NULL` to `search_messages_keyword` and `search_messages_semantic`. `search_messages_semantic_for_user` inherits the filter; if a `_for_user` keyword wrapper exists it is left unchanged for the same reason.

## 3. Don't stall CTI on a trashed message

- `cti_is_next_processable`: earlier messages with `purged_at IS NOT NULL` are ignored entirely (never blockers).
- `claim_conversation_topic_job`: candidate loop skips jobs whose message has `purged_at IS NOT NULL`, so a trashed message's own job is never claimed during its grace hour.

## 4. Deliberately not done

No new tables/columns, no registry row, no RLS change, no evidence-recount trigger (the app worker reconciles topics after the RPC).

## App-side changes in this round

Only `src/integrations/supabase/types.ts` regeneration (function bodies change; signatures do not, so the diff may be empty).

## Docs

- `docs/architecture/database.md` — Entity Deletion section: messages are scrub-not-delete tombstones, `purged_at` semantics table (NULL / future / past), search + CTI exclusions, migration timeline row.
- `docs/search/keyword.md` and `docs/search/semantic.md` — note the `purged_at IS NULL` exclusion.
- `docs/cron/readme.md` — purge worker step now scrubs messages and leaves topic reconciliation to the worker.

Docs owned by the app agent (`docs/interface/conversations.md`, `docs/architecture/realtime.md`) are untouched.

## Version

Bump `src/lib/version.ts` to `0.3.143`.

# Canonical Topics

Canonical Topics are workspace-wide topic nodes that unify topic-like output from two separate semantic pipelines: `page_topics` (per-page LLM topic name/description) and `conversation_topics` (per-conversation CTI topics). Each `canonical_topics` row represents one idea inside a workspace; `canonical_topic_evidences` records which source topics support it.

This layer is groundwork for a future Knowledge Base graph tool. The canonicalization worker (`src/semantic/canonical-topics/`) is the only application code that reads or writes these tables — see the Worker section below.

## Worker

`runCanonicalTopicsWorker` (`src/semantic/canonical-topics/worker/runCanonicalTopicsWorker.ts`) claims one `canonical_topic_jobs` row at a time via `claim_canonical_topic_job`, up to `MAX_JOBS_PER_TICK` per invocation:

- **`ADD`** (`engine/planAdd.ts`): loads the source topic's current name/description, embeds it, calls `match_canonical_topics`, and routes by similarity — `> 0.5` reinforces the best match directly, `[0.2, 0.5]` asks an LLM to arbitrate create-vs-merge over the top matches, otherwise it creates a new canonical topic seeded from the source's own (already LLM-named) content. When reinforcing pushes `evidence_count` to a multiple of 5, a second LLM call regenerates the canonical topic's name/description from a sample of its evidence before committing. Every outcome is assembled into the `p_result` payload and committed via `apply_canonical_topic_add_and_commit`. If the source row no longer exists by the time the job runs (a stale ADD — the row was deleted, or for `page_topic` re-created with a new id since `source_id` is the row's own id, not the page id), `loadSourceTopicContent` returns `null` and the job completes as a no-op via `apply_canonical_topic_remove_and_commit` rather than quarantining.
- **`REMOVE`** (`engine/planRemove.ts`): a pass-through to `apply_canonical_topic_remove_and_commit`, which does the entire fan-out delete/decrement/auto-drop itself.

Error handling follows the CTI pattern: permanent errors quarantine the job (`QUARANTINED`), transient errors retry with exponential backoff, and exceeding `MAX_TRANSIENT_BACKOFFS` parks the job on a 24h cooldown (`RETRY_WAIT`) rather than quarantining it.

Read-only server functions (`src/lib/canonical-topics.functions.ts`) — `listCanonicalTopics` and `getCanonicalTopicEvidence` — expose the result for future UI use; no UI consumes them yet.

## Tables

| Table | Role |
|-------|------|
| `canonical_topic_source_types` | Registry: `source_type` (`page_topic`, `conversation_topic`), `table_name`, `owning_entity_column`, `owning_table_name`. Used by validation/enqueue triggers to resolve workspace and owning entity. |
| `canonical_topics` | Workspace-wide topic node (`workspace_id`, `name`, `description`, `embedding vector(1536)`, `embedding_model`, `evidence_count`, `generated_at`, `regenerated_at`, `generation_model`, `last_evidence_at`, `updated_at` (any row write), `needs_regeneration`, `regeneration_requested_at`). |
| `canonical_topic_evidences` | One row per (canonical topic, source topic): `canonical_topic_id`, `source_type`, `source_id`, `owning_entity_id`, `similarity`. `source_id` is the source row's own primary key (`page_topics.id` / `conversation_topics.id`); `owning_entity_id` is the page or conversation. UNIQUE on `(canonical_topic_id, source_type, source_id)`. |
| `canonical_topic_jobs` | Work queue: `workspace_id`, `source_type`, `source_id`, `job_type` (`ADD` / `REMOVE`), `status`, `attempts`, `next_retry_at`, `started_at`, `completed_at`, `last_error`, `result`. |

## Job Lifecycle

Source changes enqueue jobs through triggers:

- `page_topics` insert → `ADD` (`source_id` = the topic row's `id`)
- `page_topics` update of `topic_name`/`topic_description` → `REMOVE` then `ADD` (content drift)
- `page_topics` delete → `REMOVE`
- `conversation_topics` insert → no enqueue (rows start as candidates)
- `conversation_topics` update `is_candidate` true → false (promotion) → `ADD`
- `conversation_topics` update `is_candidate` false → true (demotion) → `REMOVE`
- `conversation_topics` update `name`/`description` while `is_candidate = false` (established content drift) → `REMOVE` then `ADD`
- `conversation_topics` delete while `is_candidate = false` → `REMOVE`

The worker calls `claim_canonical_topic_job`, which:

1. Recovers stale `PROCESSING` rows older than `p_stale_after`.
2. Selects the oldest claimable job whose `(source_type, source_id)` has no other `PROCESSING` row.
3. Bumps `attempts` and marks it `PROCESSING`.

A partial unique index `uniq_canonical_topic_jobs_source_inflight` on `(source_type, source_id) WHERE status = 'PROCESSING'` enforces the same exclusivity at the database level.

## Commit RPCs

- **`apply_canonical_topic_add_and_commit(p_job_id, p_result)`** — takes a per-workspace advisory lock (`hashtextextended(workspace_id::text, 1)`), re-checks the job is still `PROCESSING`, re-runs a nearest-match check against the workspace's existing canonical topics (cosine similarity ≥ 0.92), and downgrades a `create` decision to `reinforce` if a match appeared meanwhile. It then inserts or updates the canonical topic, increments `evidence_count`, inserts the evidence row, and marks the job `COMPLETED`.

- **`apply_canonical_topic_remove_and_commit(p_job_id)`** — deletes all evidence rows matching the job's `(source_type, source_id)`, decrements each affected topic's `evidence_count`, deletes topics that reach zero, flags surviving topics with `needs_regeneration = true` / `regeneration_requested_at = now()`, and marks the job `COMPLETED`.

### Stale text after REMOVE

A topic's name/description is written from its evidence at the time. After a REMOVE the text may still paraphrase the removed (possibly private) source, and the topic may now be visible to users who could not see it. REMOVE therefore flags survivors; `trg_canonical_topics_clear_regen_flag` clears the flag whenever `name` or `description` changes. **The worker does not consume the flag yet** — a follow-up must regenerate flagged topics from their remaining evidence (partial index `idx_canonical_topics_needs_regeneration` supports the sweep).

## Validation

`validate_canonical_topic_evidence()` runs `BEFORE INSERT` on `canonical_topic_evidences`. It looks up the source type in `canonical_topic_source_types`, reads the owning entity from the source table, resolves `workspace_id` through the owning table, and compares it to the canonical topic's workspace. A mismatch or missing source row raises an exception.

## Access Control

- `canonical_topics` and `canonical_topic_evidences`: `authenticated` has `SELECT`, `service_role` has `ALL`. RLS enforces the **visibility premise**: a topic is readable only by a workspace member who can read the owning entity of **every** one of its evidences; evidence rows are readable only through a readable topic. Both policies call `can_read_canonical_topic(topic_id)`.
  - `can_read_evidence_owner(source_type, owning_entity_id)`: `page_topic` → `can_read_page(page)` AND `pages.purged_at IS NULL`; `conversation_topic` → `is_conversation_participant(conversation)`; any other source type → `false` (fail closed).
  - All-or-nothing: one unreadable evidence hides the whole topic (and all its evidence) from that user.
  - Both helpers are `SECURITY DEFINER` (no RLS recursion), executable by `authenticated` and `service_role` only.
- `canonical_topic_source_types` and `canonical_topic_jobs`: `service_role` only, with a `USING (false)` policy.
- All RPCs are `SECURITY DEFINER` and `GRANT EXECUTE` only to `service_role`.
- `page_topics` DELETE trigger: when the parent page is already gone (hard delete cascade), the workspace is resolved from the existing evidence's canonical topic; if no evidence exists, no `REMOVE` job is enqueued.

## Related Docs

- [Database Schema](../architecture/database.md) — Full schema, indexes, and RPC reference
- [Semantic Pipeline Overview](readme.md) — How canonical topics fit into the broader pipeline

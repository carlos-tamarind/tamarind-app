# Canonical Topics

Canonical Topics are workspace-wide topic nodes that unify topic-like output from two separate semantic pipelines: `page_topics` (per-page LLM topic name/description) and `conversation_topics` (per-conversation CTI topics). Each `canonical_topics` row represents one idea inside a workspace; `canonical_topic_evidences` records which source topics support it.

This layer is database-only groundwork for a future Knowledge Base graph tool. No application code reads or writes these tables yet.

## Tables

| Table | Role |
|-------|------|
| `canonical_topic_source_types` | Registry: `source_type` (`page_topic`, `conversation_topic`), `table_name`, `owning_entity_column`, `owning_table_name`. Used by validation/enqueue triggers to resolve workspace and owning entity. |
| `canonical_topics` | Workspace-wide topic node (`workspace_id`, `name`, `description`, `embedding vector(1536)`, `embedding_model`, `evidence_count`, `generated_at`, `regenerated_at`, `generation_model`, `last_evidence_at`). |
| `canonical_topic_evidences` | One row per (canonical topic, source topic): `canonical_topic_id`, `source_type`, `source_id`, `owning_entity_id`, `similarity`. UNIQUE on `(canonical_topic_id, source_type, source_id)`. |
| `canonical_topic_jobs` | Work queue: `workspace_id`, `source_type`, `source_id`, `job_type` (`ADD` / `REMOVE`), `status`, `attempts`, `next_retry_at`, `started_at`, `completed_at`, `last_error`, `result`. |

## Job Lifecycle

Source changes enqueue jobs through triggers:

- `page_topics` insert → `ADD`
- `page_topics` update of `topic_name`/`topic_description` → `REMOVE` then `ADD` (content drift)
- `page_topics` delete → `REMOVE`
- `conversation_topics` insert with `is_candidate = true` → `ADD`
- `conversation_topics` update `is_candidate` false → true → `ADD`
- `conversation_topics` update `is_candidate` true → false → `REMOVE`
- `conversation_topics` update `name`/`description` while `is_candidate = true` → `REMOVE` then `ADD`
- `conversation_topics` delete while `is_candidate = true` → `REMOVE`

The worker calls `claim_canonical_topic_job`, which:

1. Recovers stale `PROCESSING` rows older than `p_stale_after`.
2. Selects the oldest claimable job whose `(source_type, source_id)` has no other `PROCESSING` row.
3. Bumps `attempts` and marks it `PROCESSING`.

A partial unique index `uniq_canonical_topic_jobs_source_inflight` on `(source_type, source_id) WHERE status = 'PROCESSING'` enforces the same exclusivity at the database level.

## Commit RPCs

- **`apply_canonical_topic_add_and_commit(p_job_id, p_result)`** — takes a per-workspace advisory lock (`hashtextextended(workspace_id::text, 1)`), re-checks the job is still `PROCESSING`, re-runs a nearest-match check against the workspace's existing canonical topics (cosine similarity ≥ 0.92), and downgrades a `create` decision to `reinforce` if a match appeared meanwhile. It then inserts or updates the canonical topic, increments `evidence_count`, inserts the evidence row, and marks the job `COMPLETED`.

- **`apply_canonical_topic_remove_and_commit(p_job_id)`** — deletes all evidence rows matching the job's `(source_type, source_id)`, decrements each affected topic's `evidence_count`, deletes topics that reach zero, and marks the job `COMPLETED`.

## Validation

`validate_canonical_topic_evidence()` runs `BEFORE INSERT` on `canonical_topic_evidences`. It looks up the source type in `canonical_topic_source_types`, reads the owning entity from the source table, resolves `workspace_id` through the owning table, and compares it to the canonical topic's workspace. A mismatch or missing source row raises an exception.

## Access Control

- `canonical_topics` and `canonical_topic_evidences`: `authenticated` has `SELECT`, `service_role` has `ALL`. RLS restricts reads to workspace members.
- `canonical_topic_source_types` and `canonical_topic_jobs`: `service_role` only, with a `USING (false)` policy.
- All RPCs are `SECURITY DEFINER` and `GRANT EXECUTE` only to `service_role`.

## Related Docs

- [Database Schema](../architecture/database.md) — Full schema, indexes, and RPC reference
- [Semantic Pipeline Overview](readme.md) — How canonical topics fit into the broader pipeline

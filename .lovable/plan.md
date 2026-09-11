# Canonical Topics — database foundations

Database-only execution of the proposed epic: one migration adding the canonical-topic enums, registry, tables, RPCs and triggers, followed by types regeneration and documentation updates. No application code, no worker, no routes.

## Findings that change the proposal

Verified against the live database before planning:

1. **`page_topics` has no `id` column** — its primary key is `page_id`. So for `source_type = 'page_topic'`, `source_id` and `owning_entity_id` are the same value. That is harmless, but the registry's `owning_entity_column` for this type is `page_id` (the PK itself), and the uniqueness constraint `(canonical_topic_id, source_type, source_id)` still behaves correctly.
2. **Neither source table carries `workspace_id`** — `conversation_topics` resolves it through `conversations`, `page_topics` through `pages`. The proposed registry (`source_type, table_name, owning_entity_column`) is therefore not enough for the validation trigger to resolve a workspace dynamically. I'll add two columns to the registry: `owning_table_name` (`conversations` / `pages`) and keep the lookup as owning entity → `workspace_id`. The enqueue triggers use the same path to fill `canonical_topic_jobs.workspace_id`.
3. **`conversation_topics.name` and `.description` are nullable** — canonical topics require them non-empty, so the engine must supply them; nothing to enforce at the source side.
4. `claim_page_topic_job` is confirmed as the exact template for the claim RPC (stale-`PROCESSING` recovery on `started_at`, `ORDER BY created_at, id`, `FOR UPDATE SKIP LOCKED`, bumps `attempts`). `enqueue_page_topic_embedding` is confirmed as the trigger convention (in-body `IS NOT DISTINCT FROM` guard, `SECURITY DEFINER`, `search_path = public, extensions`).

## Migration contents

**Enums** — `canonical_topic_job_status` (`QUEUED, PROCESSING, RETRY_WAIT, COMPLETED, QUARANTINED`) and `canonical_topic_job_type` (`ADD, REMOVE`).

**`canonical_topic_source_types`** — registry keyed by `source_type`, with `table_name`, `owning_entity_column`, `owning_table_name`; seeded with `conversation_topic` and `page_topic`. Grants to `service_role` only, RLS enabled with a `USING (false)` select policy, matching `purgeable_entity_types`.

**`canonical_topics`** — as specified (workspace FK cascade, non-empty name/description, `vector(1536)` NOT NULL, `embedding_model` default `text-embedding-3-small`, evidence counters, regeneration bookkeeping), plus HNSW cosine index and a workspace index. Read access for workspace members via `is_workspace_member(workspace_id)`; all writes `service_role`.

**`canonical_topic_evidences`** — as specified, with the denormalized `owning_entity_id`, the `(canonical_topic_id, source_type, source_id)` unique constraint, the `(source_type, source_id)` index, and a `BEFORE INSERT` `SECURITY DEFINER` validation trigger that resolves the source row dynamically through the registry and rejects a workspace mismatch or a missing source row. Read access mirrors `canonical_topics` (member of the workspace); writes `service_role`.

**`canonical_topic_jobs`** — as specified, with the partial claimable index and a denormalized `workspace_id`. Also add a unique partial index `uniq_canonical_topic_jobs_source_inflight ON (source_type, source_id) WHERE status = 'PROCESSING'` so only one in-flight job can exist per source at a time. No authenticated access at all.

**`updated_at` triggers** — dedicated `set_<table>_updated_at` trigger functions on `canonical_topics` and `canonical_topic_jobs`, following the existing page-topic tables.

**RPCs** (`SECURITY DEFINER`, `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO service_role`):

- `match_canonical_topics(p_workspace_id, p_embedding, p_limit default 10)` → `id, name, description, similarity`, ordered by cosine distance.
- `enqueue_canonical_topic_job(p_workspace_id, p_job_type, p_source_type, p_source_id)` — single insert point.
- `claim_canonical_topic_job(p_stale_after default '00:10:00')` — cloned from `claim_page_topic_job`, but the candidate `SELECT` also excludes rows whose `(source_type, source_id)` already has another `PROCESSING` row (`NOT EXISTS ...`). This, combined with the partial unique index, guarantees a source never has two in-flight jobs at once, while still allowing concurrent jobs across sources and workspaces.
- `apply_canonical_topic_add_and_commit(p_job_id, p_result jsonb)` — per-workspace `pg_advisory_xact_lock(hashtextextended(workspace_id::text, 1))`, re-check `PROCESSING`, re-run the nearest-match check under the lock and downgrade `create` to `reinforce` when a matching topic appeared meanwhile, apply evidence insert / counter increment / optional regeneration fields, mark `COMPLETED`. Returns `committed | not_processing | not_found`.
- `apply_canonical_topic_remove_and_commit(p_job_id)` — no advisory lock; deletes matching evidence rows, decrements each affected topic under row-level `FOR UPDATE`, deletes topics that hit zero, marks `COMPLETED`.

**Triggers** — the four described enqueue triggers on `page_topics` (insert/content-update, delete) and `conversation_topics` (`is_candidate` promotion/demotion, delete when established), each resolving `workspace_id` through the owning entity and calling `enqueue_canonical_topic_job`. Content drift enqueues `REMOVE` then `ADD` in that order.

## Points worth flagging

- **No `QUEUED` dedup per source.** Repeated edits to the same page topic queue repeated `REMOVE`/`ADD` pairs. Ordering by `created_at` keeps them correct but the queue can grow; a dedup rule can be added later without schema change.
- **Ordering within a source is now DB-enforced.** The partial unique index plus the `NOT EXISTS` filter in `claim_canonical_topic_job` ensures only one job per `(source_type, source_id)` can be `PROCESSING` at a time, and `claim` always picks the oldest `created_at` first. A `REMOVE` enqueued before its paired `ADD` will complete before the `ADD` becomes claimable.
- **`evidence_count` is maintained by the RPCs only.** Direct deletes of evidence rows (cascade from a workspace delete aside) would leave counters stale; nothing outside the RPCs should write these tables.
- **Cascade behavior on source deletion.** Deleting a page or conversation cascades to its topics, which fires the delete triggers and enqueues `REMOVE` jobs — jobs referencing a source row that no longer exists. The remove path only needs `(source_type, source_id)`, so this works, but the job's registry FK on `source_type` (not `source_id`) is what keeps it valid.
- **Embedding dimension is hardcoded at 1536**, consistent with the rest of the semantic layer.

## After the migration

- Regenerate `src/integrations/supabase/types.ts` and verify the new tables, enums and RPCs are present.
- Update `docs/architecture/database.md`: tables section, RPC table, trigger notes, and a Migration Timeline row.
- Update `docs/semantic/` with a short canonical-topics section describing the job lifecycle and the registry.
- Bump `src/lib/version.ts`.
- Run the linter and report only findings introduced by this migration.

## Platform actions after deploy

1. **Provision `CANONICAL_TOPICS_WORKER_SECRET`** — generate a fresh high-entropy Cloudflare Worker secret, same pattern as the seven existing worker secrets. Header name: `x-canonical-topics-worker-secret`.
2. **Register the pg_cron job** — after the build containing the new route is live, schedule `run-canonical-topics-worker` every minute (`* * * * *`) calling `https://<host>/api/public/internal/run-canonical-topics-worker` with the secret header and an empty `{}` body. Early 404/503 ticks are harmless until the route and secret are live.

## Out of scope

Engine, worker implementation, API routes, server functions, UI.

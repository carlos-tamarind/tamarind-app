# Rename page semantic tables + add page topic embeddings

One migration does two things: rename the existing page embedding/semantics objects to the new topic vocabulary, and add a new `page_topic_embeddings` queue table with its trigger, claim RPC, policies and backfill.

## Part 1 — renames (structure unchanged)

Tables:
- `page_embeddings` → `page_chunk_embeddings`
- `page_semantics` → `page_topics`
- `page_semantic_jobs` → `page_topic_jobs`

Catalog names renamed to match (verified present in the database today):
- Constraints: `page_embeddings_chunk_model_key`, `page_embeddings_embedded_requires_vector`, `page_embeddings_chunk_id_fkey`, `page_embeddings_attempts_check`, `page_embeddings_pkey`, `page_semantics_page_id_fkey`, `page_semantics_pkey`, plus the four `page_semantics_*_check` constraints, `page_semantic_jobs_page_id_fkey`, `page_semantic_jobs_attempts_check`, `page_semantic_jobs_pkey`.
- Indexes: `idx_page_embeddings_queue|claimable|vector`, `uniq_page_semantic_jobs_inflight`, `idx_page_semantic_jobs_claimable|queue`.
- Triggers/functions: `trg_page_embeddings_updated_at` / `set_page_embeddings_updated_at`, and the `page_semantics` / `page_semantic_jobs` equivalents → `page_chunk_embeddings` / `page_topics` / `page_topic_jobs` names.
- RLS: the three existing "Page readers view …" policies are dropped and recreated on the new table names with the same `can_read_page(...)` predicate. Grants (`SELECT` to authenticated, `ALL` to service_role) follow the rename; re-asserted explicitly.

Functions renamed with identical signatures/return shapes and bodies rewritten against the new table names:
`claim_page_embedding_batch` → `claim_page_chunk_embedding_batch`, `list_pages_due_for_semantics` → `list_pages_due_for_topics`, `claim_page_semantic_job` → `claim_page_topic_job`, `enqueue_page_semantic_job` → `enqueue_page_topic_job`, `apply_page_semantic_result` → `apply_page_topic_result`. Old names dropped; `REVOKE ... FROM public/authenticated` + `GRANT EXECUTE TO service_role` re-applied. `search_pages_semantic` keeps its name, body replaced to read `page_chunk_embeddings`. No compatibility views.

## Part 2 — new `page_topic_embeddings`

1:1 with `page_topics` (FK on `page_id` → `page_topics(page_id)` ON DELETE CASCADE, so emptying a page's topic row cascades). Columns: `id`, `page_id` unique, `embedding vector(1536)` nullable, `embedding_model` default `text-embedding-3-small`, `embedding_status page_embedding_status` default `QUEUED`, `checksum` (length 64), `attempts` (>= 0), `next_retry_at`, `last_error`, `embedded_at`, `created_at`, `updated_at`; UNIQUE `(page_id, embedding_model)`; CHECK `EMBEDDED` implies a vector. Requeue keeps the previous vector.

- Indexes: partial claimable `(next_retry_at, created_at) WHERE status IN ('QUEUED','RETRY_WAIT')`, queue-inspection index, partial HNSW cosine `WHERE status = 'EMBEDDED'` (not wired into search yet).
- Trigger `enqueue_page_topic_embedding()` on `page_topics` AFTER INSERT OR UPDATE OF `topic_name`, `topic_description`, when inserted or the topic fields actually change. Checksum = SHA-256 of `topic_name || ': ' || topic_description`. Upserts a `QUEUED` row; a `PROCESSING` row is forced back to `QUEUED` with the new checksum so the in-flight persist no-ops. This is the only enqueue path.
- RPC `claim_page_topic_embedding_batch(p_batch_size, p_stale_after)` mirroring the renamed chunk claim (SKIP LOCKED, stale `PROCESSING` recovery via `updated_at` heartbeat), service_role only.
- RLS/grants: `SELECT` to authenticated via `can_read_page(page_id)`, `ALL` to service_role, writes service-role only.
- Backfill: insert one `QUEUED` row per existing `page_topics` row (22 rows today) with computed checksum and default model. Workers drain it.

## Required application updates

The renames break running code, so these are updated in the same change (identifier-only, no behaviour change):

- `src/semantic/pages/page-embeddings/persistence/pageEmbeddingsRepository.ts`, `worker/retry.ts`, `worker/config.ts` — table name and `claim_page_chunk_embedding_batch`.
- `src/semantic/pages/page-semantics/persistence/pageSemanticsRepository.ts`, `worker/claimJob.ts`, `types/job.ts`, `engine/config.ts`, `worker/retry.ts` — new table and RPC names, `Database["public"]["Tables"]["page_topic_jobs"]` types.
- `src/semantic/pages/page-chunks/persistence/pageChunksRepository.ts` — any `page_embeddings` reference.
- `src/integrations/supabase/types.ts` — regenerated.
- Docs touched by the rename: `docs/architecture/database.md`, `docs/semantic/page_embedding.md`, `docs/semantic/page_semantic.md`, `docs/semantic/pipeline.md`, `docs/semantic/readme.md`, `docs/search/semantic.md`, `docs/cron/readme.md`, `docs/deployment.md`, `src/semantic/README.md`.
- Version bump in `src/lib/version.ts`.

File/folder names under `src/semantic/pages/` stay as they are; renaming directories is not required by the migration and would enlarge the diff.

## Out of scope

No `search_pages_semantic` ranking over topics, no new cron job or secret, no embedding column on `page_topics`, no topic-embedding worker implementation.

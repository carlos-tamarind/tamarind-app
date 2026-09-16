# page_topics identity refactor (database)

Give `page_topics` its own `id` primary key, repoint `page_topic_embeddings` at it, and make canonical-topic `source_id` carry the topic row's id. This unblocks the page half of the canonical-topics worker, which currently fails every ADD job.

## Verified before planning

- `page_topics` PK is `page_id`; only other constraints are the FK to `pages` and three CHECKs. No other inbound FKs, no extra indexes.
- `page_topic_embeddings` carries `page_topic_embeddings_page_id_fkey` (→ `page_topics(page_id)`), `page_topic_embeddings_page_id_key` UNIQUE, `page_topic_embeddings_page_model_key` UNIQUE `(page_id, embedding_model)`.
- Confirmed the document's open question: `claim_page_topic_embedding_batch` is `RETURNS SETOF public.page_topic_embeddings` with `RETURNING te.*` and never names `page_id`. It adapts automatically — no SQL change needed.
- `search_pages_semantic` uses `page_chunk_embeddings`, not topic embeddings — unaffected.
- `apply_page_topic_result` uses `ON CONFLICT (page_id)`; the retained UNIQUE keeps it valid.

## Migration steps

1. Drop `page_topic_embeddings_page_id_fkey` (it pins the old PK index).
2. `page_topics`: add `id uuid NOT NULL DEFAULT gen_random_uuid()`, drop `page_topics_pkey`, add `page_topics_page_id_key UNIQUE (page_id)`, add `page_topics_pkey PRIMARY KEY (id)`.
3. `page_topic_embeddings`: drop the RLS SELECT policy, add `page_topic_id`, backfill from `page_topics` by `page_id`, delete any unresolved rows, set NOT NULL, add FK → `page_topics(id)` CASCADE, add UNIQUE `(page_topic_id)` and UNIQUE `(page_topic_id, embedding_model)`, drop `page_id` (its two uniques go with it), recreate the policy through `page_topics.page_id` + `can_read_page`.
4. Trigger functions: `enqueue_page_topic_embedding()` inserts `page_topic_id = NEW.id` with `ON CONFLICT (page_topic_id)`; `enqueue_page_topic_canonical_job()` passes `NEW.id` / `OLD.id` as `source_id` (workspace still resolved via `NEW.page_id`/`OLD.page_id`).
5. Backfill `canonical_topic_evidences` and `canonical_topic_jobs`: remap `page_topic` `source_id` from page id to topic id, then delete rows that cannot resolve.

Left unchanged as specified: `validate_canonical_topic_evidence()`, `canonical_topic_source_types`, `apply_page_topic_result`, `list_pages_due_for_topics`, `page_topics` RLS, `set_page_topics_updated_at`, all `page_topic_jobs` objects.

## Risks flagged and accepted

**1. Application code will break — accepted.** Scope stays database-only. These files read columns that are changing and are deliberately left untouched (page pipeline stays broken and the TypeScript build fails until they are handled separately):

- `src/semantic/pages/page-embeddings/worker/runPageEmbeddingWorker.ts` — reads `row.page_id` off claimed `page_topic_embeddings` rows.
- `src/semantic/pages/page-embeddings/persistence/pageTopicEmbeddingsRepository.ts` — keys page topics by `page_id`.
- `src/semantic/canonical-topics/engine/loadSourceTopic.ts` — looks up `page_topics` by `page_id = source_id` and returns `owningEntityId = source_id`.
- `src/semantic/canonical-topics/engine/persistence/loadCanonicalContext.ts` and `src/lib/canonical-topics.functions.ts` — resolve page-topic evidence by `page_id IN (...)`.

**2. Worker traffic during the migration — accepted.** A step-5 delete may drop a job a worker holds as `PROCESSING`; the commit RPC returns `not_found` and the worker skips it.

**3. `UNIQUE (page_topic_id, embedding_model)` kept.** The same redundancy exists today; repointing identity is the job, not index cleanup.

**4. Multi-topic readiness is structural only — accepted.** `page_id` stays UNIQUE and `apply_page_topic_result` still upserts on it, so one topic per page remains enforced.


## Also updated (nothing beyond this)

- Supabase types regeneration.
- `docs/architecture/database.md` (page_topics / page_topic_embeddings schema, constraints, trigger descriptions, migration timeline row), `docs/semantic/page_semantic.md`, `docs/semantic/page_embedding.md`, `docs/semantic/canonical_topics.md` (page-topic `source_id` now the topic row id).

No application code changes, no version bump.

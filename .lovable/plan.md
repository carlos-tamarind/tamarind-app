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

## Risks to flag before proceeding

**1. The "no application changes" constraint cannot hold.** Four app files read the columns being changed. Leaving them untouched means the page pipeline stays broken and the TypeScript build fails once types regenerate:

- `src/semantic/pages/page-embeddings/worker/runPageEmbeddingWorker.ts` (lines 155–190) reads `row.page_id` off claimed `page_topic_embeddings` rows — that column no longer exists.
- `src/semantic/pages/page-embeddings/persistence/pageTopicEmbeddingsRepository.ts` — `loadPageTopicsByIds` keys page topics by `page_id`; it must key by topic id.
- `src/semantic/canonical-topics/engine/loadSourceTopic.ts` — looks up `page_topics` with `.eq("page_id", job.source_id)` and returns `owningEntityId = job.source_id`. After the change `source_id` is the topic id, so the lookup must use `id` and the owning entity must be the row's `page_id`. Without this fix the worker still fails on every page ADD job, just with a different error.
- `src/semantic/canonical-topics/engine/persistence/loadCanonicalContext.ts` and `src/lib/canonical-topics.functions.ts` — resolve page-topic evidence by `page_id IN (...)`; must select by `id`.

I recommend including these five minimal adaptations in the same change. Confirm and I will fold them in; otherwise the migration ships a knowingly broken build.

**2. Worker traffic during the migration.** The canonical-topics and page-embedding crons run every minute. The step-5 deletes can remove a job a worker is holding as `PROCESSING`; the commit RPC then returns `not_found`, which the worker logs and skips — tolerable, but cleanest is to run the migration and app changes together and accept one or two skipped ticks.

**3. `UNIQUE (page_topic_id, embedding_model)` is redundant** while `UNIQUE (page_topic_id)` exists — a second index for nothing. It becomes meaningful only if the single-embedding-per-topic rule is later relaxed. I will create it as specified unless you prefer to drop it.

**4. Multi-topic readiness is structural only.** `page_id` stays UNIQUE and `apply_page_topic_result` still upserts on it, so one topic per page remains enforced. That is the stated intent; noting it so it isn't mistaken for the feature landing.

## Also updated

- Supabase types regeneration.
- `docs/architecture/database.md` (page_topics / page_topic_embeddings schema, constraints, trigger descriptions, migration timeline row), `docs/semantic/page_semantic.md`, `docs/semantic/page_embedding.md`, `docs/semantic/canonical_topics.md` (page-topic `source_id` now the topic row id).
- Version bump in `src/lib/version.ts`.

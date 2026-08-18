# Page Semantics — database groundwork, worker endpoints, ops

Scope: one SQL migration, regenerated types, database docs, two HTTP routes plus a placeholder runner, and cron/secret ops. No analysis engine, no LLM calls.

## Migration

**Enum `public.page_semantic_job_status`** — `QUEUED | PROCESSING | RETRY_WAIT | COMPLETED | FAILED`. Dedicated type; `cti_job_status` and `page_embedding_status` untouched.

**Table `public.page_semantics`** — source of truth for the last successful analysis, no status column.
- `page_id` uuid PK → `pages(id)` ON DELETE CASCADE
- `topic_name`, `topic_description`, `page_snapshot` text NOT NULL, each CHECK `length(trim(...)) > 0`
- `page_snapshot_hash` text NOT NULL CHECK `length(...) = 64`
- `llm_model` text NOT NULL
- `created_at` / `updated_at` timestamptz NOT NULL DEFAULT `now()`, BEFORE UPDATE trigger
- PK is the only index. Missing row = never analyzed; the row always describes exactly `page_snapshot`.

**Table `public.page_semantic_jobs`**
- `id` uuid PK DEFAULT `gen_random_uuid()`, `page_id` uuid NOT NULL → `pages(id)` ON DELETE CASCADE
- `page_snapshot_hash` text NOT NULL, `status` NOT NULL DEFAULT `'QUEUED'`
- `attempts` int NOT NULL DEFAULT 0 CHECK `>= 0`, `next_retry_at`, `started_at`, `completed_at`, `last_error` nullable
- `created_at` / `updated_at` NOT NULL DEFAULT `now()`, BEFORE UPDATE trigger
- Partial UNIQUE `(page_id)` WHERE status IN (`QUEUED`,`PROCESSING`,`RETRY_WAIT`) — one in-flight job per page
- Partial claim index `(next_retry_at, created_at)` WHERE status IN (`QUEUED`,`RETRY_WAIT`)
- Inspection index `(status, next_retry_at, created_at)`
- Terminal rows accumulate as debug history; no uniqueness on `(page_id, hash)`.

**Access (mirrors `page_chunks` / `page_embeddings`)** — `GRANT SELECT` to `authenticated`, `GRANT ALL` to `service_role`, no `anon`. RLS enabled, SELECT-only policy for `authenticated` via `EXISTS (SELECT 1 FROM public.pages p WHERE p.id = <table>.page_id)` so existing page visibility applies. All writes go through `service_role`.

## RPCs (all SECURITY INVOKER, EXECUTE revoked from PUBLIC/anon/authenticated, granted to `service_role`)

- `list_pages_due_for_semantics(p_idle interval DEFAULT '5 minutes', p_limit int DEFAULT 20)` — pages with `last_modified_at <= now() - p_idle` that either have non-empty `plain_text` with no `page_semantics` row or a live `encode(sha256(convert_to(plain_text,'UTF8')),'hex')` differing from `page_snapshot_hash`, or have empty `plain_text` with an existing row (cleanup). Returns `page_id, title, plain_text, page_snapshot, page_snapshot_hash` (snapshot columns null on first run), ordered `last_modified_at ASC, page_id ASC`, limit `GREATEST(1, LEAST(p_limit, 100))`. Token thresholds stay in the app.
- `claim_page_semantic_job(p_stale_after interval DEFAULT '10 minutes')` — recovers stale `PROCESSING` (`started_at < now() - p_stale_after`) back to `QUEUED`, then claims one `QUEUED`/`RETRY_WAIT` row whose `next_retry_at` is null or due, `FOR UPDATE SKIP LOCKED`, `ORDER BY created_at`, flips to `PROCESSING` with `started_at = now()` and `attempts + 1`. Returns the row.
- `enqueue_page_semantic_job(p_page_id uuid, p_hash text)` — helper around the partial unique index: no-op when a `PROCESSING` row exists; otherwise overwrite hash and reset an existing `QUEUED`/`RETRY_WAIT` row to `QUEUED`, or insert a new one.
- `apply_page_semantic_result(p_job_id uuid, p_topic_name text, p_topic_description text, p_page_snapshot text, p_page_snapshot_hash text, p_llm_model text)` — CTI-style atomic commit. Locks the job `FOR UPDATE`; returns `'not_processing'` if status differs; returns `'drifted'` (job `COMPLETED`, `last_error` null, no `page_semantics` write) when the live page is missing, empty, or its hash no longer matches; otherwise upserts `page_semantics` and marks the job `COMPLETED` with `completed_at = now()` and cleared `last_error` / `next_retry_at` / `started_at`, returning `'committed'`.

## HTTP routes

- `src/routes/api/public/internal/run-page-semantic-worker.ts` — POST, header `x-page-semantic-worker-secret`, env `PAGE_SEMANTIC_WORKER_SECRET` read inside the handler, timing-safe compare, opaque 404 on mismatch, 503 when unset. Copies the page-embedding route shape.
- `src/routes/api/run-page-semantic-worker.ts` — dev-only mirror, same guard as the other workers.
- `src/semantic/pages/page-semantics/worker/runPageSemanticWorker.ts` — thin placeholder runner returning zero counts so the route, build, and cron work today; the engine owner replaces its body later.

## Ops

- Mint a fresh high-entropy `PAGE_SEMANTIC_WORKER_SECRET` in the platform (not reusing any existing worker secret).
- Schedule `run-page-semantic-worker` in `cron.schedule` every minute against `/api/public/internal/run-page-semantic-worker`, same host pattern as the CTI cron. Chunking cron stays the sweeper.

## Types and docs

- Regenerate `src/integrations/supabase/types.ts` (two tables, new enum, four RPCs).
- Update `docs/architecture/database.md`: Pages / Embedding Pipeline sections, enum table, index list, RPC table, access notes, migration timeline.
- Add the new secret, endpoint, and cron block to `docs/deployment.md` and `docs/api/readme.md`.

## Notes and risks

- Deleting a page cascades to both new tables.
- Hash comparison uses the live `plain_text` generated column, so a page edited mid-run reliably yields `'drifted'` rather than a stale write.
- Terminal job rows grow unbounded by design; pruning is a later concern.
- Cron will log 404s until a build containing the new route is published.

## Out of scope

Analysis engine, LLM prompts/calls, retry policy code, backfill, semantic page search, app UI.

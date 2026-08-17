# Page chunking: due-list RPC + worker endpoints

Database RPC plus the two HTTP entry points. No chunking engine, no writes to `page_chunks` yet — the worker only lists due pages and reports counts.

## 1. SQL migration

New file under `supabase/migrations/`.

**Index**
`CREATE INDEX IF NOT EXISTS idx_pages_last_modified_at ON public.pages (last_modified_at);` — the idle filter would otherwise sequential-scan. Chunk staleness reuses the existing `UNIQUE (page_id, position)` index.

**Function `public.list_pages_due_for_chunking(p_idle interval DEFAULT '5 minutes', p_limit int DEFAULT 20)`**
- `RETURNS SETOF public.pages`, `LANGUAGE plpgsql`, `SECURITY INVOKER`, `SET search_path = public`.
- List, not claim: no status column to flip and statement-scoped row locks would not serialize overlapping ticks, so no `FOR UPDATE SKIP LOCKED`. Reconcile is idempotent; overlapping ticks on one page are acceptable.
- Due iff `last_modified_at <= now() - p_idle` and either:
  1. `length(trim(coalesce(plain_text,''))) > 0` and (no `page_chunks` rows for the page, or `max(chunk.updated_at) < pages.last_modified_at`), or
  2. `length(trim(coalesce(plain_text,''))) = 0` and at least one `page_chunks` row exists (cleanup).
- Not due: empty never-chunked pages, pages edited inside the debounce window, pages whose chunks were reconciled after the last edit.
- `ORDER BY last_modified_at ASC, id ASC`, `LIMIT GREATEST(1, LEAST(p_limit, 100))` so a bad caller cannot dump the table.

**Privileges**
`REVOKE ALL` from `PUBLIC`, `anon`, `authenticated`; `GRANT EXECUTE` to `service_role` only.

Then regenerate `src/integrations/supabase/types.ts`.

## 2. Worker (list-only)

- `src/semantic/pages/page-chunking/config.ts` — `PAGE_CHUNKING_DEBOUNCE_MS` (5 min) and `PAGE_CHUNKING_BATCH_SIZE` (20), plus a helper turning the debounce into a Postgres interval string.
- `src/semantic/pages/page-chunking/listPagesDueForChunking.ts` — calls the RPC through `supabaseAdmin`, throws on error, returns the rows.
- `src/semantic/pages/page-chunking/runPageChunkingWorker.ts` — one tick: list due pages, log via `DebugLogger`, return `{ pagesDue, pageIds }`. No chunk writes; the engine lands in a later change. Uses `id` + `content` from each row when the engine ships — `plain_text` is only the emptiness signal inside the RPC.

## 3. HTTP endpoints

Mirroring the embedding worker exactly:
- `src/routes/api/public/internal/run-page-chunking-worker.ts` — POST, dedicated `PAGE_CHUNKING_WORKER_SECRET` checked against the `x-page-chunking-worker-secret` header with `timingSafeEqual`, opaque 404 on mismatch, 503 when the secret is unset.
- `src/routes/api/run-page-chunking-worker.ts` — dev-only POST (404 unless `import.meta.env.DEV` or `VITE_DEBUG_LOGS === "true"`).

The secret itself and the pg_cron schedule are not part of this change; they are a separate manual step like the CTI cron.

## Notes and risks

- `SECURITY INVOKER` + service-role-only execute means the function sees all pages; no RLS filtering applies to worker calls, which is intended.
- Using `max(chunk.updated_at)` as the freshness signal means any unrelated update to a chunk row marks the page reconciled; acceptable because the engine only touches chunks during reconcile.
- Clock skew between `pages.last_modified_at` and chunk timestamps is not an issue — both come from the database.
- No backfill trigger: historical pages will drain gradually, longest-idle first, at `p_limit` per tick.

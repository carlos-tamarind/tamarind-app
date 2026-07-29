## Goal

One focused migration that stabilizes the DB contract for the embedding worker. No app code, no worker, no repositories.

## Verified current state

- `message_embeddings.token_count integer NOT NULL` exists — to be dropped.
- `idx_message_embeddings_semantic` (btree on `message_semantics_id`) already exists — no-op.
- `idx_message_embeddings_vector` (hnsw, `vector_cosine_ops`) already exists — no-op.
- No index on `message_semantics(embedding_status, last_processed_at)` — to be created.
- Existing helpful indexes: `idx_message_semantics_queue` on `(next_retry_at, created_at) WHERE embedding_status = 'QUEUED'`, unique on `message_id` and `checksum`.

## Migration contents

1. `ALTER TABLE public.message_embeddings DROP COLUMN token_count;`

2. `CREATE INDEX IF NOT EXISTS idx_message_semantics_status_processed ON public.message_semantics (embedding_status, last_processed_at);`
   (the two `message_embeddings` indexes are written as `IF NOT EXISTS` too, so the migration is self-contained but a no-op for them)

3. `CREATE OR REPLACE FUNCTION public.claim_embedding_batch(p_batch_size int DEFAULT 20, p_stale_after interval DEFAULT '10 minutes')`
   - `RETURNS SETOF public.message_semantics`, `LANGUAGE plpgsql`, **`SECURITY INVOKER`**, `SET search_path = public`.
   - Single statement, two-stage candidate selection via a CTE union, ordered so stale `PROCESSING` rows come first, then `QUEUED`:
     - Stage 1: `embedding_status = 'PROCESSING' AND last_processed_at < now() - p_stale_after`
     - Stage 2: `embedding_status = 'QUEUED' AND processable = true AND (next_retry_at IS NULL OR next_retry_at <= now())`
     - Both ordered by `next_retry_at NULLS FIRST, created_at`, `LIMIT p_batch_size`, `FOR UPDATE SKIP LOCKED`.
   - `UPDATE public.message_semantics SET embedding_status = 'PROCESSING', last_processed_at = now(), updated_at = now() WHERE id IN (candidates) RETURNING *` — returned to the caller.
   - Atomic: the lock, the status flip, and the return happen in one statement, so two concurrent workers never claim the same row.

4. Grants: `REVOKE ALL ... FROM PUBLIC, anon, authenticated;` then `GRANT EXECUTE ON FUNCTION public.claim_embedding_batch(int, interval) TO service_role;` — the worker runs with the admin client only; this must never be callable from the browser.

## On SECURITY INVOKER

Switching to INVOKER as requested — there is no strong reason for DEFINER here. The only caller is the worker using the service-role client, which already bypasses RLS on its own, so DEFINER would add privilege escalation surface without adding capability. INVOKER also means that if the function is ever accidentally exposed to `authenticated`, RLS on `message_semantics` still applies (the table is service_role-only today, so such a call would simply return nothing rather than silently claiming rows). The `REVOKE` + narrow `GRANT` in step 4 remains the primary guard.

## Notes

- `token_count` drop is destructive but the table is empty in practice (no embeddings written yet — writes come in a later task).
- Batch size and stale timeout are function parameters with defaults (20 rows, 10 minutes), so the worker can tune them without another migration.
- Nothing in app code currently reads `token_count`; the generated Supabase types will refresh after the migration runs.

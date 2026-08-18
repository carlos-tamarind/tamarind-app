# Page embedding worker — answers to the DB annotations

Answer to the open question first, then the decisions the upcoming engine should follow.

## 5. Secret: new one, do not reuse

Mint a dedicated `PAGE_EMBEDDING_WORKER_SECRET` with header `x-page-embedding-worker-secret`, matching the existing three (`EMBEDDING_WORKER_SECRET`, `CTI_WORKER_SECRET`, `PAGE_CHUNKING_WORKER_SECRET`). Reasons: each worker already has its own; a leak of one secret stays scoped to one endpoint; rotating the message-embedding secret would otherwise silently break page embedding. Same shape as the other endpoints: timing-safe compare, opaque 404 on mismatch, 503 when unset.

## Decisions taken on the other points

1. **No persist/finalize RPC for now.** Persist with a guarded `UPDATE ... WHERE id = $1 AND embedding_status = 'PROCESSING' AND checksum = $2`; zero rows updated means the row drifted and the worker logs a skip. Add a SQL RPC only if we later need multi-row atomicity.
2. **Claim stays vector-table-only.** Worker fetches chunk `content` + `checksum` in one follow-up `IN (...)` query, then compares against the claimed row's checksum before embedding. No signature change.
3. **Heartbeat is an app contract.** Worker bumps `updated_at` (touch `attempts`-free no-op update) before each `embedBatch` and between batches, so `updated_at < now() - p_stale_after` stays meaningful. Documented in the worker config and `docs/semantic/`.
4. **Retry model follows CTI, not message embeddings.** Transient failures go to `RETRY_WAIT` with exponential backoff; exceeding the transient budget sets `RETRY_WAIT` with a 24h `next_retry_at` and `attempts` reset. `FAILED` is reserved for permanent errors (bad input, unsupported model) and is never claimed.
6. **No extra index at MVP.** Revisit only if stale-recovery scans show up in slow queries.
7. **Worker-side guards.** Missing chunk → persist no-ops (CASCADE already deleted the row); checksum mismatch → skip persist and log, because reconciliation has queued a fresh row.

## Work implied by these decisions

- `src/semantic/pages/page-embeddings/` engine: claim → load chunks → checksum guard → `embedBatch` → guarded persist, plus retry/backoff module mirroring the CTI pattern.
- `src/routes/api/public/internal/run-page-embedding-worker.ts` (secret-guarded) and `src/routes/api/run-page-embedding-worker.ts` (dev-only).
- Store `PAGE_EMBEDDING_WORKER_SECRET`, schedule the `run-page-embedding-worker` pg_cron job every minute against the stable production host.
- Docs: add the secret and cron snippet to `docs/deployment.md`, the endpoint to `docs/api/readme.md`, and a page-embedding section under `docs/semantic/`.

## Not in scope

Page semantic search RPC, backfill of existing pages, changes to the message embedding pipeline, schema changes to `page_embeddings`.

# Page Semantics — database groundwork

Database-only. One SQL migration, then regenerated types and schema docs. No chunking engine, no OpenAI calls, no cron, no search RPC.

## What gets created

**Enum `public.page_embedding_status`** — `QUEUED | PROCESSING | RETRY_WAIT | EMBEDDED | FAILED`. Dedicated enum; `public.embedding_status` is left untouched so message/CTI predicates cannot be affected.

**Table `public.page_chunks`**
- `id` uuid PK `gen_random_uuid()`, `page_id` uuid NOT NULL → `pages(id)` ON DELETE CASCADE
- `position` int NOT NULL CHECK (>= 0), `content` text NOT NULL CHECK (`length(trim(content)) > 0`)
- `checksum` text NOT NULL (hex SHA-256 from app), `token_count` int NOT NULL CHECK (> 0)
- `created_at` / `updated_at` timestamptz NOT NULL default `now()`
- UNIQUE (page_id, position); INDEX `idx_page_chunks_page_checksum` (page_id, checksum), non-unique
- BEFORE UPDATE trigger `trg_page_chunks_updated_at`

**Table `public.page_embeddings`**
- `id` uuid PK, `chunk_id` uuid NOT NULL → `page_chunks(id)` ON DELETE CASCADE
- `embedding` vector(1536) NULL, `embedding_model` text NOT NULL (no default)
- `embedding_status` page_embedding_status NOT NULL default `'QUEUED'`, `checksum` text NOT NULL
- `attempts` int NOT NULL default 0 CHECK (>= 0), `next_retry_at`, `last_error`, `embedded_at` nullable
- `created_at` / `updated_at` timestamptz NOT NULL default `now()`
- UNIQUE (chunk_id, embedding_model) — re-embed updates in place
- CHECK `embedding_status <> 'EMBEDDED' OR embedding IS NOT NULL`
- Indexes: `idx_page_embeddings_queue` (embedding_status, next_retry_at, created_at); partial `idx_page_embeddings_claimable` (next_retry_at, created_at) WHERE status IN ('QUEUED','RETRY_WAIT'); partial HNSW `idx_page_embeddings_vector` on `embedding vector_cosine_ops` WHERE status = 'EMBEDDED'
- BEFORE UPDATE trigger `trg_page_embeddings_updated_at`

## Access

Both tables: `GRANT SELECT` to `authenticated`, `GRANT ALL` to `service_role`, no `anon`. RLS enabled, SELECT-only policies for `authenticated`; all writes go through `service_role`.

- `page_chunks`: `EXISTS (SELECT 1 FROM public.pages p WHERE p.id = page_chunks.page_id)`
- `page_embeddings`: `EXISTS (SELECT 1 FROM public.page_chunks c JOIN public.pages p ON p.id = c.page_id WHERE c.id = page_embeddings.chunk_id)`

Nested page reads are filtered by the existing page visibility policy (including `is_page_collaborator`), so no visibility predicates are duplicated.

## Worker claim RPC

`public.claim_page_embedding_batch(p_batch_size int DEFAULT 20, p_stale_after interval DEFAULT '10 minutes')` returns `SETOF public.page_embeddings`, SECURITY INVOKER, `SET search_path = public`. It recovers stale `PROCESSING` rows via `updated_at < now() - p_stale_after`, claims `QUEUED`/`RETRY_WAIT` rows whose `next_retry_at` is null or due, uses `FOR UPDATE SKIP LOCKED`, and flips them to `PROCESSING`. `REVOKE ALL` from PUBLIC/anon/authenticated; `GRANT EXECUTE` to `service_role` only.

Because `updated_at` is the heartbeat, the future worker must bump `updated_at` while processing — documented in the migration and the docs.

## Follow-up in the same change

- Regenerate `src/integrations/supabase/types.ts` (two tables, new enum, new RPC).
- Update the Pages and Embedding Pipeline sections of `docs/architecture/database.md`: new tables, enum values, index list, `claim_page_embedding_batch`, pipeline-only writes, and the naming split (`embedding` / `embedding_model` here vs `embedding_vector` / `model` on `message_embeddings`).

## Technical notes and risks

- `position` is a non-reserved keyword in Postgres; it is quoted where needed in the DDL and RPC.
- HNSW is created inside the migration transaction — fine on an empty table; a later rebuild on a large table will need a separate `CONCURRENTLY` migration.
- Partial HNSW is required because `embedding` starts NULL; pgvector on this instance already backs the message HNSW index, the partial predicate is the only new element.
- Fixed `vector(1536)` matches `text-embedding-3-small`; another dimension needs a new column/table.
- `checksum` is intentionally not globally unique (same text may appear on many pages); `position` is order, not identity — reconciliation must delete/reinsert rows rather than update by position.
- Empty pages produce zero chunk rows; the CHECK forbids a blank chunk.
- Deleting a page cascades to chunks and embeddings.
- No backfill: existing pages stay unchunked until the engine ships.

## Not in scope

Chunking/debounce logic, OpenAI usage, cron routes, backfill, `search_pages_semantic`, workspace_id denormalization, TipTap offsets, app version bump.

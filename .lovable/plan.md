# Task 2 — Embeddings storage schema

Single migration covering the new table, the two new columns on `message_semantics`, and all indexes.

## 1. Extend `message_semantics`

Add columns:
- `retry_count INT NOT NULL DEFAULT 0`
- `next_retry_at TIMESTAMPTZ NULL`

## 2. Create `message_embeddings`

Columns exactly as specified:
- `id UUID PK DEFAULT gen_random_uuid()`
- `message_semantics_id UUID NOT NULL REFERENCES message_semantics(id) ON DELETE CASCADE`
- `model TEXT NOT NULL`
- `dimensions INTEGER NOT NULL`
- `embedding_vector VECTOR(1536) NOT NULL`
- `token_count INTEGER NOT NULL`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Relationship: `message_semantics 1 — n message_embeddings`.

## 3. Grants + RLS

Following project rules — all writes/reads server-side via `supabaseAdmin` (embeddings pipeline). Grants:
- `GRANT ALL ON public.message_embeddings TO service_role`
- No `authenticated`/`anon` grants (never accessed from the browser)

Enable RLS with no policies (locked to service role only), matching how `message_semantics` is treated.

## 4. Indexes

On `message_embeddings`:
- `idx_message_embeddings_semantic` on `(message_semantics_id)`
- `idx_message_embeddings_vector` HNSW on `(embedding_vector vector_cosine_ops)`
- `idx_message_embeddings_active` on `(is_active)`

On `message_semantics`:
- `idx_message_semantics_queue` on `(next_retry_at, created_at) WHERE embedding_status = 'QUEUED'`
- `idx_message_semantics_message` UNIQUE on `(message_id)` — created only if no equivalent unique constraint/index already exists (will verify via `pg_indexes` in the same migration using `CREATE UNIQUE INDEX IF NOT EXISTS`)

## 5. Version bump

Bump app version 0.1.35 → 0.1.36 after migration succeeds.

## Out of scope (deferred to later tasks)

- Repository/service layer for embeddings
- Queue worker / retry orchestration
- OpenAI embedding calls

Confirm and I'll run the migration.

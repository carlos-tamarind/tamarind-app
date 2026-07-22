# Task 1 — Message Semantics schema, checksum, and persistence

Foundational storage + utilities for the Message Embedding pipeline. No normalization logic yet.

## 1. Database migration (`create_message_semantics_table`)

- Create enum `embedding_status` with values: `NEW`, `QUEUED`, `PROCESSING`, `EMBEDDED`, `FAILED`, `SKIPPED`.
- Create table `public.message_semantics`:
  - `id UUID PK DEFAULT gen_random_uuid()`
  - `message_id UUID NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE`
  - `normalized_text TEXT NOT NULL`
  - `checksum VARCHAR(64) NOT NULL UNIQUE`
  - `language TEXT NOT NULL DEFAULT 'en'`
  - `quality_score NUMERIC(3,2) NOT NULL DEFAULT 0.0` + `CHECK (quality_score >= 0 AND quality_score <= 1)`
  - `processable BOOLEAN NOT NULL DEFAULT TRUE`
  - `embedding_status embedding_status NOT NULL DEFAULT 'NEW'`
  - `last_error TEXT NULL`
  - `last_processed_at TIMESTAMPTZ NULL`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Unique indexes on `message_id` and `checksum` (implicit); explicit btree on `embedding_status` for future queue queries.
- `set_updated_at()` function + BEFORE UPDATE trigger.
- Grants: `SELECT, INSERT, UPDATE, DELETE` to `authenticated`; `ALL` to `service_role`.
- Enable RLS. Policies:
  - SELECT for `authenticated` gated by an `EXISTS` check against `messages` matching the existing message-visibility predicate (confirmed during implementation).
  - No direct INSERT/UPDATE/DELETE for `authenticated` — pipeline writes via `supabaseAdmin`.

## 2. Checksum utility

`src/semantic/checksum/computeMessageChecksum.ts` — pure sync function using Node `crypto.createHash("sha256")` (works in Worker SSR via `nodejs_compat`), returns 64-char hex digest. Matches the spec's sync signature exactly.

## 3. Persistence layer

- `src/semantic/persistence/types.ts` — exports `EmbeddingStatus`, `MessageSemantics`, `InsertMessageSemanticsInput` per spec.
- `src/semantic/persistence/messageSemanticsRepository.ts` — server-only; loads `supabaseAdmin` via dynamic import inside each function to keep it out of any client bundle:
  - `insertMessageSemantics(input)` — omits undefined optionals so DB defaults apply; returns the inserted row.
  - `findMessageSemanticsByMessageId(messageId)` — row or null.
  - `findMessageSemanticsByChecksum(checksum)` — row or null.
  - Throws on unexpected DB errors; "no rows" returns null.

## 4. Version bump

`src/lib/version.ts` → `0.1.33`.

## Out of scope

Normalization, PII sanitization, logging, `/src/semantic/normalization/`, background jobs, message-send integration.

## Acceptance

- Migration applies cleanly (enum, table, trigger, grants, RLS).
- `computeMessageChecksum("hello")` returns deterministic 64-char hex.
- Repository insert/lookup functions work via `supabaseAdmin`.
- Types exported and usable.
- Version bumped.

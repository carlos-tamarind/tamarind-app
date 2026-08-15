# CTI database groundwork (v3)

Database-only. Adds the job queue for Conversation Topic Identification, plus integrity and ownership hardening on the existing topic tables.

## 1. New table `conversation_topic_jobs`

One row per embedded message to be processed.

```text
id                    uuid PK default gen_random_uuid()
message_id            uuid NOT NULL UNIQUE -> messages(id) ON DELETE CASCADE
conversation_id       uuid NOT NULL        -> conversations(id) ON DELETE CASCADE
status                cti_job_status NOT NULL default 'QUEUED'
attempt_count         integer NOT NULL default 0 CHECK (attempt_count >= 0)
next_retry_at         timestamptz NULL
processing_started_at timestamptz NULL
completed_at          timestamptz NULL
last_error            text NULL
created_at            timestamptz NOT NULL default now()
updated_at            timestamptz NOT NULL default now()
```

New enum `cti_job_status`: `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`.
`updated_at` maintained by a BEFORE UPDATE trigger (same pattern as the other tables).

Indexes:
- `(conversation_id, status, next_retry_at, created_at)`
- `(conversation_id, message_id)`
- `(status, next_retry_at, created_at)`

## 2. Claiming RPC (one job at a time)

`claim_conversation_topic_job(p_stale_after interval default '10 minutes')`, SECURITY DEFINER, returns the single claimed row.

- First returns stale `PROCESSING` jobs (started before `now() - p_stale_after`) to `QUEUED`.
- Then picks one `QUEUED` job with `next_retry_at IS NULL OR next_retry_at <= now()`, ordered by the message's real chronological position (`messages.created_at`, then `id`), using `FOR UPDATE SKIP LOCKED` so concurrent workers never claim the same job.
- Sets `status = 'PROCESSING'`, `processing_started_at = now()`, `attempt_count = attempt_count + 1`.
- No batch variant.

Execute granted to `service_role` only (the CTI backend runs privileged).

## 3. Conversation-level serialization

Two SECURITY DEFINER helpers wrapping Postgres advisory locks keyed on the conversation UUID:
- `cti_lock_conversation(_conversation_id uuid)` — transaction-scoped `pg_advisory_xact_lock` (released automatically on COMMIT/ROLLBACK).
- `cti_try_lock_conversation(_conversation_id uuid) returns boolean` — non-blocking variant so a worker can skip a conversation already being processed.

Different conversations lock independently. `service_role` execute only.

## 4. Atomic state mutation

No extra objects needed: the application runs the insert-evidence / update-topic / set `current_topic_id` / complete-job sequence inside one transaction that also holds the advisory lock. The existing `UNIQUE (topic_id, message_id)` on `conversation_topic_evidences` provides the idempotency guard, so a retry either inserts fresh evidence or no-ops.

## 5. Cross-conversation integrity

Currently nothing stops an evidence row from pairing a topic and a message from different conversations, and nothing stops `conversations.current_topic_id` pointing at another conversation's topic. Both are fixed with composite foreign keys:

```text
UNIQUE (id, conversation_id) on messages
UNIQUE (id, conversation_id) on conversation_topics

conversation_topic_evidences
  ADD COLUMN conversation_id uuid NOT NULL   -- backfilled from the topic
  FK (topic_id, conversation_id)   -> conversation_topics(id, conversation_id) ON DELETE CASCADE
  FK (message_id, conversation_id) -> messages(id, conversation_id) ON DELETE CASCADE

conversations
  FK (id, current_topic_id) -> conversation_topics(conversation_id, id) ON DELETE SET NULL
```

`current_topic_id` stays nullable; the composite FK is simply not enforced while it is NULL.

## 6. Established-topic constraint

Replace `CHECK (is_candidate = true OR name IS NOT NULL)` with:

```sql
CHECK (is_candidate = true
       OR (name IS NOT NULL AND description IS NOT NULL AND embedding IS NOT NULL))
```

Candidates remain free to have any combination of name/description/embedding, so both the T3 (aggregate embedding only) and T2 (LLM name + description + embedding) creation paths stay valid.

## 7. Pipeline ownership

CTI state becomes application-owned:
- `conversation_topic_jobs`: RLS on, `SELECT` for participants of the job's conversation, no INSERT/UPDATE/DELETE for `authenticated`; full access for `service_role`.
- `conversation_topic_evidences`: drop the participant INSERT/UPDATE/DELETE policies and revoke those grants from `authenticated`; keep the participant SELECT policy.
- `conversation_topics`: same — participants keep read access, writes move to `service_role`.

## 8. Job creation

Not part of this migration (application code writes the job after an embedding is persisted). `UNIQUE (message_id)` makes that insert idempotent.

## Notes / things I will not do

- No decay of `historical_weight` in the database — it stays a monotonic accumulator maintained by the pipeline.
- No vector index on topic embeddings (unchanged from previous rounds).
- Existing `CHECK (evidence_count > 0)` on `conversation_topics` stays as-is: a topic must be created together with its first evidence in the same transaction.
- After the migration, regenerate the generated database types.
- No other codebase changes.

## Version

Bump `src/lib/version.ts` to 0.2.04.

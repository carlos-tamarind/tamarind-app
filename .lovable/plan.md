# CTI SQL follow-ups (v4)

Database-only. Makes the CTI job pipeline safe for a worker that talks to Postgres over supabase-js (one HTTP call = one transaction).

The feedback is correct on all three points: the current `claim_conversation_topic_job` picks the globally oldest eligible job regardless of per-conversation order, `cti_lock_conversation` called as a standalone RPC releases its advisory lock the moment that call commits, and nothing today prevents a CTI job row from existing before its message is embedded.

## 1. Shared ordering predicate

One SQL helper used by both claim and commit, so the rule lives in exactly one place.

`cti_is_next_processable(_conversation_id uuid, _message_id uuid) returns boolean`
(SECURITY DEFINER, STABLE, service_role only)

True when no chronologically earlier message in the same conversation (ordered by `messages.created_at`, then `messages.id`) satisfies either:

- it has a `conversation_topic_jobs` row whose status is not `COMPLETED`, or
- it has a `message_semantics` row with `embedding_status IN ('NEW','QUEUED','PROCESSING','EMBEDDED')` and no `COMPLETED` CTI job.

Messages with no `message_semantics` row, `SKIPPED`, or `FAILED` embedding status never block.

Job `created_at` is not used anywhere in ordering.

## 2. Replace the claim function

`claim_conversation_topic_job(p_stale_after interval default '10 minutes')` keeps its signature and return type. New body:

1. Requeue stale `PROCESSING` jobs (unchanged).
2. Scan eligible `QUEUED` jobs (`next_retry_at IS NULL OR <= now()`) in `messages.created_at, messages.id` order and pick the **first one that passes `cti_is_next_processable`**, using `FOR UPDATE SKIP LOCKED`. Conversations that are blocked are simply skipped, so other conversations remain independently claimable.
3. Mark it `PROCESSING`, set `processing_started_at`, increment `attempt_count`.

No `attempt_count` is burned on out-of-order jobs any more, because they are never claimed.

## 3. Completion in a single function

`commit_cti_job(p_job_id uuid) returns text` (SECURITY DEFINER, service_role only). One function body = one transaction, so the advisory lock is held for the whole thing:

1. `pg_advisory_xact_lock` on the job's conversation.
2. Re-read the job `FOR UPDATE`; if it is not `PROCESSING`, return `'not_processing'`.
3. Re-check `cti_is_next_processable`; if false, return `'not_next'` (worker then calls release).
4. Set `status = 'COMPLETED'`, `completed_at = now()`, clear `last_error`; return `'committed'`.

This is the seam where the future engine applies its topic/evidence/`current_topic_id` mutation plan before completing — still inside the same lock and transaction.

`release_conversation_topic_job(p_job_id uuid)` (service_role only): set `status = 'QUEUED'`, `processing_started_at = NULL`, `attempt_count = greatest(attempt_count - 1, 0)`. Not a failure; `last_error` untouched.

## 4. Gate job creation on EMBEDDED

`finalize_embedded_message(p_message_semantics_id uuid)` (SECURITY DEFINER, service_role only), one transaction:

1. `UPDATE message_semantics SET embedding_status = 'EMBEDDED', last_processed_at = now(), last_error = NULL` for that id.
2. `INSERT INTO conversation_topic_jobs (message_id, conversation_id) SELECT ... ON CONFLICT (message_id) DO NOTHING`.

Plus a `BEFORE INSERT` trigger on `conversation_topic_jobs` that raises an exception unless the message has a `message_semantics` row with `embedding_status = 'EMBEDDED'`. No other path can create a job early.

## Decision to confirm

A CTI job stuck in `FAILED` blocks every later message in its conversation forever (head-of-line block). That is exactly what the stated rule says, and it is the safe reading for sequential topic tracking — a topic decision made while skipping a message would be wrong. This plan implements it as written; unblocking a poisoned conversation is an operational action (requeue the failed job).

## Technical notes

- All new functions: `SECURITY DEFINER`, `SET search_path = public`, `REVOKE EXECUTE FROM public/anon/authenticated`, `GRANT EXECUTE TO service_role`.
- Supporting index on `conversation_topic_jobs (message_id, status)` and on `messages (conversation_id, created_at, id)` if not already present, so the ordering predicate stays cheap.
- Regenerate `src/integrations/supabase/types.ts` so the new RPCs are typed.
- No application/worker code changes in this migration.

## Version

Bump `src/lib/version.ts` to 0.2.05.

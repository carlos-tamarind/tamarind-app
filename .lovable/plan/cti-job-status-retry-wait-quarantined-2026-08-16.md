# CTI job status: RETRY_WAIT + QUARANTINED

Database-only change. Replaces the single terminal `FAILED` state with a retryable state and a terminal, non-blocking quarantine state, and makes the ordering predicate and the claim function agree with it.

Verified before planning: `conversation_topic_jobs` currently has zero rows, and the `cti_job_status` enum is referenced nowhere in application code (only in the generated types file). So the enum can be swapped cleanly instead of carrying a dead `FAILED` value forever.

## 1. Enum replacement

Final values: `QUEUED | PROCESSING | COMPLETED | RETRY_WAIT | QUARANTINED`.

Because the table is empty and no code depends on `FAILED`, replace the type in one migration rather than `ADD VALUE` + leftover value:

1. `ALTER TYPE public.cti_job_status RENAME TO cti_job_status_old`
2. Create the new `public.cti_job_status` with the five final values
3. Drop the column default, `ALTER TABLE ... ALTER COLUMN status TYPE public.cti_job_status USING (case when status::text = 'FAILED' then 'QUARANTINED' else status::text end)::public.cti_job_status`, restore `DEFAULT 'QUEUED'`
4. `DROP TYPE public.cti_job_status_old`

The `FAILED -> QUARANTINED` mapping in step 3 is a safety net; there are no such rows today.

Existing indexes on `status` are rebuilt automatically by the column type change.

## 2. `cti_is_next_processable`

Both clauses must treat `QUARANTINED` as settled, otherwise an EMBEDDED + QUARANTINED message keeps blocking its conversation:

- job clause: an earlier message blocks if it has a job whose `status NOT IN ('COMPLETED','QUARANTINED')`
- embedding-waiter clause: earlier message with `embedding_status IN ('NEW','QUEUED','PROCESSING','EMBEDDED')` blocks only when `NOT EXISTS (job with status IN ('COMPLETED','QUARANTINED'))`

Everything else in the predicate (ordering by `messages.created_at, messages.id`, SKIPPED/FAILED embeddings never blocking) is unchanged.

## 3. `claim_conversation_topic_job`

- Stale `PROCESSING` jobs are still requeued to `QUEUED`.
- Candidate set becomes `status IN ('QUEUED','RETRY_WAIT')` with `next_retry_at IS NULL OR next_retry_at <= now()`, still ordered by `messages.created_at, messages.id` and still filtered through `cti_is_next_processable`, with `FOR UPDATE SKIP LOCKED`.
- The row-level re-check inside the loop uses the same candidate condition.

`RETRY_WAIT` rows whose `next_retry_at` is in the future are skipped but still block later messages in their conversation — which is correct, they are not settled.

## 4. Unchanged

`attempt_count`, `next_retry_at`, `last_error` stay as they are. No new columns. `commit_cti_job`, `release_conversation_topic_job`, `finalize_embedded_message` and the EMBEDDED insert trigger are untouched apart from being recompiled where the enum literals appear.

## Technical notes

- All functions keep `SECURITY DEFINER`, `SET search_path = public`, revoked from public/anon/authenticated, `EXECUTE` granted to `service_role` only.
- Regenerate `src/integrations/supabase/types.ts` so `cti_job_status` reflects the five values.
- No application or worker code changes; nothing outside migrations, generated types and the version file is modified.

## Version

Bump `src/lib/version.ts` to 0.2.07.

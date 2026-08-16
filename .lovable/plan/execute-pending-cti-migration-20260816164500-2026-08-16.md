# Execute pending CTI migration (20260816164500)

Apply the prepared migration byte-for-byte through the migration tool. It adds two service_role-only functions:

- `match_conversation_topics(conversation_id, message_id)` — returns every embedded topic of a conversation with cosine similarity against the message's active embedding.
- `apply_cti_plan_and_commit(job_id, plan jsonb)` — single-transaction apply of the topic mutation plan (insert/update/delete topics, insert/move evidences, set `conversations.current_topic_id`) followed by marking the job `COMPLETED`; returns `not_found` / `not_processing` / `not_next` / `committed`.

Verified: both RPCs are already called by `loadCtiContext.ts` and `applyCtiPlan.ts`, `src/integrations/supabase/types.ts` is already regenerated, and topic/message embeddings are both `vector(1536)`, matching the declared return type. No schema/table changes, no data changes, no grants to `anon`/`authenticated`.

## Risks identified (no blockers)

1. **Topic deletion runs after the `current_topic_id` update.** If a plan sets a current topic and also lists it in `topicsToDelete`, the `ON DELETE SET NULL` composite FK silently nulls it. Worker-side plan builder must never do both; the DB will not complain.
2. **`evidencesToMove` deletes all remaining evidences of the source topic**, including rows that could not be moved because the target already had that message. That is the intended dedupe, but it is a destructive step — no undo.
3. **Constraint failures abort the whole RPC.** The non-candidate topic check (`name`, `description`, `embedding` required) and the `similarity BETWEEN 0 AND 1` check raise, so the job stays `PROCESSING` and is only recovered by the stale-requeue path in `claim_conversation_topic_job`, not by the retry/backoff path. Worst case is delayed reprocessing, not data loss.
4. **`match_conversation_topics` returns zero rows when the message has no active embedding** (CROSS JOIN on an empty subselect), which is indistinguishable from "conversation has no topics". Callers already treat both as "no matches".
5. **`commit_cti_job` becomes redundant** — `apply_cti_plan_and_commit` supersedes it. Leaving it in place is harmless; no cleanup in this task.
6. `CREATE OR REPLACE` only; re-running is safe and the migration is reversible by dropping the two functions.

## Steps

1. Apply the migration file unchanged.
2. Confirm the two functions exist with `SECURITY DEFINER`, `search_path = public, extensions`, and EXECUTE granted only to `service_role`.
3. Run the database linter and report anything new.

No application code changes; `src/lib/version.ts` bump only if you want one (say the word).

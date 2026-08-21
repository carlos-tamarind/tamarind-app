# Conversation suggestions — DB migration

Prepares the database for the upcoming conversation suggestions feature: two tables, three enums, queue RPCs, user-scoped search wrappers, plus the secret-guarded worker route stub and its cron schedule.

## Decisions locked in

- Partial unique index cannot use `now()` (not immutable) → unique on `PENDING` rows only; expiry enforced in the RPC/worker.
- No denormalized `entity_type` column — readers join `entity_types` through `entities`.
- `entity_id` FK → `entities(id)` **ON DELETE CASCADE** (page_chunk entities die on every re-chunk).
- Status enum stays `PENDING` / `SHOWN` / `EXPIRED`; clicks and dismissals are timestamps.
- Job table column names match `page_topic_jobs`: `attempts`, `started_at`, `completed_at`.
- Version bump to `0.3.12`.

## 1. Migration A — enums and tables

Enums: `conversation_suggestion_status` (`PENDING`, `SHOWN`, `EXPIRED`), `conversation_suggestion_feedback` (`positive`, `negative`), `conversation_suggestion_job_status` (`QUEUED`, `PROCESSING`, `RETRY_WAIT`, `COMPLETED`, `FAILED`).

`conversation_suggestions`: id, workspace_id, workspace_user_id, conversation_id (+ composite FK to `conversation_participants`), entity_id (CASCADE), conversation_topic_id (composite FK to `conversation_topics(id, conversation_id)` — the required unique exists), status, `entity_similarity_score` and `llm_confidence` float4 CHECK 0..1, reason, notification_text, created_at, last_modified_at (trigger), expires_at default `now() + 48h`, shown_at / clicked_at / dismissed_at / feedback_at, feedback_type. CHECKs exactly as specified (ordering, timestamps require `shown_at`, feedback pair both-or-neither).

`conversation_suggestion_jobs`: id, conversation_id, workspace_id, workspace_user_id, composite participant FK, `UNIQUE (conversation_id, workspace_user_id)`, status, `attempts` int CHECK >= 0, next_retry_at, `started_at`, `completed_at`, last_error, created_at, last_modified_at.

Indexes as drafted: unique partial on PENDING; `(workspace_user_id, conversation_id, entity_id, created_at DESC)`; `(workspace_user_id, conversation_id, feedback_type, feedback_at DESC)`; `(conversation_id, status)`; `expires_at`; `entity_id`; jobs claimable partial `(next_retry_at, created_at) WHERE status IN ('QUEUED','RETRY_WAIT')`; stale `started_at WHERE status = 'PROCESSING'`.

GRANTs in the same migration: `SELECT` to `authenticated`, `ALL` to `service_role` (plus `UPDATE` to `authenticated` on `conversation_suggestions` for the feedback path). RLS on both tables: suggestions readable/updatable when `workspace_user_id = current_workspace_user_id(workspace_id)` AND `is_conversation_participant(conversation_id)`; jobs SELECT-only for the owning participant; INSERT/DELETE service role only.

## 2. Migration B — user-scoped search wrappers

Existing ACL helpers (`can_read_page`, `is_conversation_participant`, `current_workspace_user_id`) resolve the caller through `auth.uid()`, which is null under the service-role cron. So this migration adds explicit-user variants (`can_read_page_as(_page_id, _workspace_user_id)`, `is_conversation_participant_as(_conversation_id, _workspace_user_id)`) with the same logic, then:

- `search_pages_semantic_for_user(p_workspace_user_id, ...)` and `search_messages_semantic_for_user(p_workspace_user_id, ...)` — `SECURITY DEFINER`, execute granted to `service_role` only.
- Both call the existing ranking RPC unchanged (no forked ranking SQL), over-fetch (`p_limit * 4`) and post-filter by the user ACL before trimming to `p_limit`, so ACL pruning cannot silently shrink results.
- Same return shapes, including `chunk_id` and `match_text`. Messages are **not** filtered to exclude the current conversation.

## 3. Migration C — queue RPCs (service_role execute only)

- `list_conversation_suggestion_jobs_due(p_idle, p_limit)` — participant×conversation pairs with a winner topic, recent embedded message, no negative-feedback cooldown, no unexpired PENDING suggestion, and job missing / `COMPLETED` / `FAILED` / due `RETRY_WAIT`. Limit capped at 100.
- `enqueue_conversation_suggestion_job(p_conversation_id, p_workspace_user_id)` — upsert returning `enqueued` / `requeued` / `processing`.
- `claim_conversation_suggestion_job(p_stale_after)` — `FOR UPDATE SKIP LOCKED`, stale `PROCESSING` recovery via `started_at`, bumps `attempts`.
- `apply_conversation_suggestion_result(...)` — expires stale PENDING rows, inserts the suggestion (or completes with none/reject) and sets the job `COMPLETED` + `completed_at` in one transaction; enforces PENDING uniqueness.

## 4. Worker route stub and cron

- `src/routes/api/public/internal/run-conversation-suggestion-worker.ts` — same shape as the page-semantic route: header `x-conversation-suggestions-worker-secret`, timing-safe compare, 503 when the secret is unset, 404 on mismatch, `DebugLogger` tick logging.
- A minimal `runConversationSuggestionWorker()` placeholder under `src/semantic/conversation-suggestions/worker/` returning zero counters, so the endpoint is live but inert until the real worker lands.
- Dev-only mirror route `src/routes/api/run-conversation-suggestion-worker.ts` for local triggering, matching the existing pattern.
- Secret `CONVERSATION_SUGGESTIONS_WORKER_SECRET` (new, not reused).
- `pg_cron` + `pg_net` job every 10 minutes against the stable project host.

## 5. Types, docs, version

Regenerate `src/integrations/supabase/types.ts`; update `docs/architecture/database.md` (tables, enums, indexes, functions, migration timeline), `docs/cron/readme.md`, `docs/api/readme.md`, `docs/deployment.md`; bump `src/lib/version.ts` to `0.3.12`.

## Out of scope

No suggestion engine, no UI, no changes to existing search strategies or the search overlay.

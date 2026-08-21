# Review — conversation suggestions DB migration

Overall the plan is sound and matches existing conventions (page_topic_jobs queue shape, service-role writes, RLS-gated reads). Below are the issues I verified against the live database plus the corrections I would apply before running the migration.

## Blocking issues found

**1. Partial unique index with `now()` will be rejected.** `now()` is not immutable, so it cannot appear in an index predicate. Use the fallback the document already anticipates: partial unique on `(workspace_user_id, conversation_id) WHERE status = 'PENDING'`, and enforce expiry (flip `PENDING` → `EXPIRED`) in the worker/RPC before inserting a new suggestion.

**2. The denormalized `entity_type` cannot be FK-validated as written.** `entities` has only `PRIMARY KEY (id)` — no unique on `(id, entity_type_id)` — so there is no composite FK to keep `entity_type` honest. Options: add `UNIQUE (entities.id, entity_type_id)` and a composite FK, or drop the denormalized column and join `entity_types` (cheap, indexed). Recommendation: add the unique + composite FK so the CHECK and the real type can never diverge.

**3. `entity_id` needs `ON DELETE CASCADE`.** `page_chunk` entities are deleted on every re-chunk. Without cascade, inserts of new suggestions are fine but old rows block chunk deletion and break the chunking worker.

**4. The user-scoped search wrappers need parameterized ACL helpers.** `can_read_page`, `is_conversation_participant` and `current_workspace_user_id` all resolve the caller via `auth.uid()` — under `service_role` cron they return nothing. So "wrap the existing function" is not enough; the migration must also add `_as_workspace_user` variants (e.g. `can_read_page_as(_page_id, _workspace_user_id)`, `is_conversation_participant_as(...)`) that take the user explicitly, with the same logic. The ranking SQL is still not forked — the `SECURITY DEFINER` wrapper calls the base RPC and post-filters — but the wrapper must over-fetch (e.g. `p_limit * 4`) before ACL filtering, otherwise ACL pruning silently shrinks results below `p_limit`.

## Smaller corrections

- Every new public table needs explicit `GRANT`s in the same migration (`SELECT` to `authenticated`, `ALL` to `service_role`) — RLS alone leaves the Data API returning permission errors.
- The composite FK `(conversation_id, workspace_user_id) → conversation_participants` already implies the conversation FK; keeping the standalone `conversation_id` FK is harmless but redundant. Keep it only for the explicit `ON DELETE CASCADE` semantics.
- `status` has no `CLICKED`/`DISMISSED` value, so clicked/dismissed rows stay `SHOWN` and are distinguished only by timestamps. That is workable; confirm the reader queries assume it.
- Column-name drift is intentional per the document (`attempt_count`, `processing_started_at`, `processing_completed_at` vs. the page tables' `attempts`, `started_at`, `completed_at`). Fine, but it means the page-jobs claim RPC cannot be copied verbatim.
- `conversation_topics` does have `UNIQUE (id, conversation_id)`, so the composite topic FK works as written. `conversation_participants` PK is `(conversation_id, workspace_user_id)` — the composite FK works too. Both verified.
- Job-table RLS: existing sibling tables (`page_topic_jobs`, `conversation_topic_jobs`) expose SELECT to `authenticated` only. Mirroring that is consistent.

## Scope conflicts to resolve

- **Cron target does not exist.** The plan schedules `pg_cron` → `/api/public/internal/run-conversation-suggestion-worker`, but app changes are out of scope, so that route would 404 on every tick. Either create the secret-guarded route stub in this pass (as was done for the page-semantic worker) or defer scheduling the cron until the worker lands.
- **Version number.** The document says bump to `0.3.12`, but `src/lib/version.ts` currently reads `0.3.111`. `0.3.12` would be a downgrade under string ordering; `0.3.112` is the consistent next patch.

## Proposed execution order (once the above are settled)

1. Migration A — enums, `conversation_suggestions`, `conversation_suggestion_jobs`, GRANTs, RLS policies, indexes, `last_modified_at` triggers, plus `UNIQUE (id, entity_type_id)` on `entities`.
2. Migration B — parameterized ACL helpers and the two `SECURITY DEFINER` user-scoped search wrappers (`service_role` execute only).
3. Migration C — the four queue RPCs (`list_..._due`, `enqueue_...`, `claim_...`, `apply_..._result`), `service_role` execute only.
4. Secret `CONVERSATION_SUGGESTION_WORKER_SECRET` + cron schedule (only if the route stub is in scope).
5. Regenerate `types.ts`, update `docs/architecture/database.md` (tables, indexes, functions, migration timeline) and `docs/cron/readme.md`, bump version.

## Open questions

- Create the worker route stub now, or hold the cron job until the app-side worker exists?
- Confirm version target `0.3.112`.
- Keep the denormalized `entity_type` (with the new composite FK) or drop it in favour of a join?

# Retire the `NEW` embedding status

Remove the vestigial `NEW` value from the `embedding_status` enum and make `QUEUED` the column default on `message_semantics`.

## Verified current state

- `message_semantics` rows with `embedding_status = 'NEW'`: **0** — nothing to clean up, but the migration still runs a defensive `UPDATE ... SET embedding_status = 'QUEUED' WHERE embedding_status = 'NEW'` before the type swap.
- Column default is currently `'NEW'::embedding_status`.
- The enum is used by exactly one column (`message_semantics.embedding_status`) plus three indexes over it.
- Two database functions embed the literal `'NEW'` in their bodies: `cti_is_next_processable` and `cti_jobs_require_embedded` (both in an `embedding_status IN ('NEW','QUEUED','PROCESSING','EMBEDDED')` predicate). They must be recreated without it.

## Migration steps (single migration)

PostgreSQL cannot drop an enum value, so the type is rebuilt:

1. Defensive `UPDATE` of any `NEW` rows to `QUEUED`.
2. `ALTER TABLE message_semantics ALTER COLUMN embedding_status DROP DEFAULT`.
3. `ALTER TYPE public.embedding_status RENAME TO embedding_status_old`; create `public.embedding_status AS ENUM ('QUEUED','PROCESSING','EMBEDDED','FAILED','SKIPPED')`.
4. `ALTER TABLE message_semantics ALTER COLUMN embedding_status TYPE public.embedding_status USING embedding_status::text::public.embedding_status`.
5. Re-add the default: `SET DEFAULT 'QUEUED'`.
6. Recreate `cti_is_next_processable` and `cti_jobs_require_embedded` with the same logic minus `'NEW'` (predicate becomes `IN ('QUEUED','PROCESSING','EMBEDDED')`), preserving their `SECURITY DEFINER`, `search_path`, and grants.
7. `DROP TYPE public.embedding_status_old`.
8. Verify the three indexes (`idx_message_semantics_queue`, `message_semantics_embedding_status_idx`, `idx_message_semantics_message_status`, `idx_message_semantics_status_processed`) survive the type change; the partial `WHERE embedding_status = 'QUEUED'` index is rebuilt explicitly if the type swap invalidates it.

No RLS policy, constraint, or grant references the enum, so none change.

## Docs and types

- `docs/architecture/database.md`: enum table row for `embedding_status` drops `NEW`; add a migration-timeline entry dated 2026-08-22.
- `docs/semantic/pipeline.md` line ~151: remove the `NEW (initial, rarely seen)` node from the state diagram; the pipeline inserts directly as `QUEUED` or `SKIPPED`.
- Regenerate `src/integrations/supabase/types.ts` (enum union loses `"NEW"`).
- App version bumped from `0.3.132` to `0.3.133`.

## Approved app-code change

`src/semantic/messages/message-persistence/types.ts` currently declares:

```ts
export type EmbeddingStatus = "NEW" | "QUEUED" | "PROCESSING" | "EMBEDDED" | "FAILED" | "SKIPPED";
```

`"NEW"` is removed from that union. Nothing assigns it, so the change is type-safe and non-behavioural.


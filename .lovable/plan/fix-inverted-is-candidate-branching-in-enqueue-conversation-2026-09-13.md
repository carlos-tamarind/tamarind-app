# Fix inverted `is_candidate` branching in `enqueue_conversation_topic_canonical_job`

## Goal

Replace the trigger function body so canonical-topic jobs are enqueued only for **established** conversation topics (`is_candidate = false`), fixing the inversion shipped in migration `20260911063227`.

## Background

Confirmed against the live function: every branch treats `is_candidate = true` as the source-eligible state, when the established meaning is the opposite — candidates are unproven rows (a topic may be unnamed only while a candidate). As shipped:

- INSERT enqueues ADD for new candidates (which CTI creates constantly).
- DELETE enqueues REMOVE only for candidates, so established topics are never cleaned up.
- Promotion enqueues ADD, demotion enqueues REMOVE — both backwards.
- Content drift only fires on candidate rows, missing established-topic drift.

Verified live via `pg_get_functiondef`; `enqueue_page_topic_canonical_job()` is unaffected (page_topics has no candidate concept).

## Changes

### Migration (corrective, full `CREATE OR REPLACE`)

Same signature (`RETURNS trigger`, SECURITY DEFINER, `SET search_path = public`), same trigger — only the body changes:

- **INSERT**: return immediately, no enqueue.
- **DELETE**: enqueue `REMOVE` only when `OLD.is_candidate = false`.
- **UPDATE**:
  - `OLD.is_candidate = true AND NEW.is_candidate = false` → `ADD` (promotion).
  - `OLD.is_candidate = false AND NEW.is_candidate = true` → `REMOVE` (demotion).
  - `NOT NEW.is_candidate AND (name/description IS DISTINCT FROM OLD)` → `REMOVE` then `ADD` (established content drift).
  - Candidate rows never enqueue on UPDATE (candidate-phase churn stays invisible to canonical topics).

Also re-assert the existing `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated` (or confirm it still stands) so no new linter warning appears.

### Documentation

- `docs/architecture/database.md`: update the trigger description for `enqueue_conversation_topic_canonical_job` (INSERT no-op; DELETE/promotion/demotion/drift semantics) and add a migration-timeline row.
- `docs/semantic/canonical_topics.md`: align the source-eligibility wording ("only established topics become canonical-topic sources").

### Version

- Bump `src/lib/version.ts` (`0.3.220` → `0.3.221`).

### Verification

- Re-read the function via `pg_get_functiondef` and walk each branch.
- Run the database linter; confirm no new findings.

## Out of scope

- No changes to `enqueue_page_topic_canonical_job`, the RPCs, tables, or the worker route.
- No cleanup of jobs enqueued under the old semantics: none exist yet (no canonical topic worker traffic has run against this trigger).

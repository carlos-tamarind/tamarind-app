# Canonical topics: owner index, rename updated_at, regenerate-on-REMOVE flag

One migration in `supabase/migrations/` (timestamped `.sql`, no Drizzle), a 2-line change in `src/lib/canonical-topics.functions.ts` (explicitly approved), types regen and docs. Version unchanged.

## Current state (verified)

- Evidence indexes: `(canonical_topic_id)`, `(source_type, source_id)`, `(canonical_topic_id, source_type, owning_entity_id)`, unique `(canonical_topic_id, source_type, source_id)`. None leads with `owning_entity_id`.
- `canonical_topics.updated_at` is maintained by `trg_canonical_topics_updated_at` -> `set_canonical_topics_updated_at()` (BEFORE UPDATE).
- It is also set explicitly (`updated_at = now()`) on `canonical_topics` inside `apply_canonical_topic_add_and_commit` and `apply_canonical_topic_remove_and_commit`. Their `updated_at` writes on `canonical_topic_jobs` are a different table and stay.
- `public.set_last_modified_at()` exists (sets `NEW.last_modified_at := now()`), used by pages/conversations/messages.
- No other DB function references `set_canonical_topics_updated_at`.
- App: only `listCanonicalTopics` reads `canonical_topics.updated_at` (select + mapping). Worker code does not.
- `apply_canonical_topic_remove_and_commit` never touches name/description.

## 1. Owner index

`CREATE INDEX idx_canonical_topic_evidences_owner ON canonical_topic_evidences (source_type, owning_entity_id);`

## 2. Rename `canonical_topics.updated_at` -> `last_modified_at`

- `ALTER TABLE canonical_topics RENAME COLUMN updated_at TO last_modified_at;` (data preserved, no backfill).
- Drop `trg_canonical_topics_updated_at`; create `trg_canonical_topics_last_modified_at BEFORE UPDATE ... EXECUTE FUNCTION public.set_last_modified_at()`.
- Drop the now-unused `set_canonical_topics_updated_at()`.
- `CREATE OR REPLACE` both commit RPCs, changing only the `canonical_topics` assignment `updated_at = now()` -> `last_modified_at = now()` (redundant with the trigger but kept explicit, matching current style). Everything else byte-identical; grants re-asserted (service_role only).
- `canonical_topic_evidences.updated_at` and `canonical_topic_jobs.updated_at` stay as-is (internal tables, out of scope).

## 3. Flag topics for regeneration on REMOVE

- `ADD COLUMN needs_regeneration boolean NOT NULL DEFAULT false`, `ADD COLUMN regeneration_requested_at timestamptz`.
- In the same rewrite of `apply_canonical_topic_remove_and_commit`: surviving topics (evidence_count > 0) get `needs_regeneration = true, regeneration_requested_at = now()`.
- Auto-clear: small `BEFORE UPDATE` trigger `trg_canonical_topics_clear_regen_flag` resets `needs_regeneration = false, regeneration_requested_at = NULL` when `name` or `description` changes. The current multiple-of-5 regeneration therefore clears it with no RPC change.
- Partial index `ON canonical_topics (workspace_id) WHERE needs_regeneration`.
- RLS/grants unchanged.

## 4. App change (approved, this file only)

`src/lib/canonical-topics.functions.ts`: select `last_modified_at` instead of `updated_at`; map `updatedAt: row.last_modified_at`. The `CanonicalTopicView` shape stays the same, so no caller changes.

## 5. Types and docs

- Regenerate Supabase types.
- `docs/semantic/canonical_topics.md`: Tables (renamed column, new flag columns), Commit RPCs (REMOVE flags), "Stale text after REMOVE" note.
- `docs/architecture/database.md`: column rename, triggers, index, RPC behavior.

## Rollout risk (please confirm)

- **Rename is a breaking change for the published app.** Until it is republished, the live `listCanonicalTopics` selects `updated_at` and would error. No UI calls it today, so real impact is nil, but it will throw if called. Publish right after this lands.
- **The migration tool blocks column renames.** I will write the complete SQL to `supabase/migrations/`, apply the non-breaking parts (index, flag columns, triggers) through the normal path only if they can be separated cleanly; otherwise you run the single file once in the SQL editor in the Cloud view. I will tell you which at implementation time and give you a direct button.
- Alternative if you prefer zero downtime: add `last_modified_at`, backfill, switch code, keep `updated_at` deprecated. Not planned unless you ask.

## Verification

SQL: index exists; `updated_at` gone and `last_modified_at` populated; an update bumps `last_modified_at`; REMOVE on a multi-evidence topic sets the flag; changing name clears it. `bunx tsgo --noEmit` passes.

## Flagged for app changes (not tackled)

- The worker must consume `needs_regeneration` (regenerate name/description from remaining evidence) — the flag alone does not stop the leak.
- Once it does: optionally make `can_read_canonical_topic` return false while flagged (fail closed).
- Multiple-of-5 check uses `evidence_count`, which REMOVE decrements, so the same multiple can trigger twice; minor.

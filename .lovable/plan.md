# Canonical topics: index, last_modified_at, regenerate-on-REMOVE flag

One migration in `supabase/migrations/` (timestamped `.sql`, no Drizzle), then types regen and docs. No app code changes. Version unchanged.

## Current state (verified)

- Evidence indexes: `(canonical_topic_id)`, `(source_type, source_id)`, `(canonical_topic_id, source_type, owning_entity_id)`, unique `(canonical_topic_id, source_type, source_id)`. Nothing leads with `owning_entity_id`.
- `canonical_topics` has `updated_at` (bumped by `trg_canonical_topics_updated_at` on every write, including evidence_count changes), `generated_at`, `regenerated_at`, `last_evidence_at`. No `last_modified_at`.
- `apply_canonical_topic_remove_and_commit` deletes evidence, decrements `evidence_count`, drops topics at 0 — never touches name/description.

## 1. Index

`CREATE INDEX idx_canonical_topic_evidences_owner ON canonical_topic_evidences (source_type, owning_entity_id);`
`source_type` first because every join/visibility lookup is per source type (page vs conversation); still serves "all topics for this page/conversation" queries.

## 2. `last_modified_at` column

Meaning (distinct from the others): **last time the user-visible text (name or description) changed.** `updated_at` stays "any row write", `last_evidence_at` stays "last evidence added".

- `ADD COLUMN last_modified_at timestamptz NOT NULL DEFAULT now()`, backfilled to `COALESCE(regenerated_at, generated_at)`.
- `BEFORE UPDATE` trigger sets `last_modified_at = now()` only when `name` or `description` is distinct from the old value. No RPC changes needed.

## 3. Flag topics for regeneration on REMOVE

- `ADD COLUMN needs_regeneration boolean NOT NULL DEFAULT false` and `regeneration_requested_at timestamptz`.
- Update `apply_canonical_topic_remove_and_commit`: for each surviving topic (evidence_count > 0), set `needs_regeneration = true, regeneration_requested_at = now()`.
- Clear the flag automatically: the `last_modified_at` trigger from step 2 also resets `needs_regeneration = false` whenever name/description changes, so any future regeneration clears it without RPC edits.
- Partial index `ON canonical_topics (workspace_id) WHERE needs_regeneration` for a future worker sweep.
- Grants/RLS unchanged (authenticated SELECT via existing policy, service_role ALL).

## 4. Types and docs

- Regenerate Supabase types.
- `docs/semantic/canonical_topics.md`: Tables (new columns + meanings), Commit RPCs (REMOVE now flags), new "Stale text after REMOVE" note.
- `docs/architecture/database.md`: columns, index, trigger, RPC behavior.

## Verification

SQL checks: index exists; backfill non-null; updating name bumps `last_modified_at` and clears flag, updating only `evidence_count` does not; a REMOVE on a multi-evidence topic sets the flag.

## Flagged for app changes (not tackled)

- **The flag alone does not fix the leak.** The canonical topics worker must consume `needs_regeneration` (regenerate name/description from remaining evidence, reusing the existing regeneration LLM call) — e.g. a sweep per tick, or enqueue a regenerate job inside the REMOVE path.
- **Optional hard gate, once the worker handles it:** make `can_read_canonical_topic` return false while `needs_regeneration` is true (fail closed). Not done now, because without the worker change flagged topics would stay hidden forever.
- Read functions (`listCanonicalTopics`) could expose `lastModifiedAt` instead of `last_evidence_at ?? updated_at`.
- The worker's multiple-of-5 regeneration check uses `evidence_count`, which REMOVE decrements — counts can revisit the same multiple and regenerate twice; minor.

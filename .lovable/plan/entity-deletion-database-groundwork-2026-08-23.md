# Entity deletion — database groundwork

Adds soft-delete (trash) state and a generic purge mechanism, designed so new deletable entity types can be added later without rewriting the purge logic. No trash/recover UI in this task.

## What gets added

### 1. Soft-delete columns
- `pages.purged_at timestamptz NULL`
- `messages.purged_at timestamptz NULL` (groundwork only, no UI)
- Partial index on each: `(purged_at) WHERE purged_at IS NOT NULL`

A non-null `purged_at` means "in trash, eligible for hard delete at that instant". Recover = set it back to NULL.

### 2. Future-proofing: a purgeable-type registry
Rather than hardcoding table names inside the RPC, the purge walks a small registry so a new deletable type is one row + one column away:

```text
purgeable_entity_types
  entity_type_key text PK   -- references entity_types.key ('page', 'message', ...)
  table_name      text      -- 'pages', 'messages'
  purge_order     int       -- children purged before parents
```

Seeded with `page` and `message`. Service-role read only; no authenticated grants.

### 3. Trigger: trash clears pins
`trg_pages_unpin_on_purge` (AFTER UPDATE OF `purged_at` on `pages`, when it transitions NULL -> non-null) deletes every `pinned_entities` row for that entity id, for all users. Recovering the page does not restore pins. Implemented with the same `SECURITY DEFINER` + revoked-grants pattern as the existing unpin triggers.

### 4. RPC `purge_due_entities(p_entity_ids uuid[] DEFAULT NULL)`
- `SECURITY DEFINER`, `search_path = public`, executable by `service_role` only (revoked from `public`/`anon`/`authenticated`).
- Iterates `purgeable_entity_types` in `purge_order`, and for each table deletes rows where `purged_at IS NOT NULL AND purged_at <= now()`, optionally intersected with `p_entity_ids`.
- Existing `ON DELETE CASCADE` chains handle semantics, chunks, embeddings, topics, suggestions, and the `entities` registry row (via the existing sync triggers).
- Returns `TABLE(entity_type text, id uuid)` of everything actually deleted.

### 5. Deliberately unchanged
- `list_pages_due_for_chunking` / `list_pages_due_for_topics` keep including trashed pages — the semantic engine is unaffected by trash state.
- No RLS changes: a trashed page stays readable under existing visibility rules, so recover flows work without special policies.
- No changes to search RPCs (filtering trashed rows out of results is an app-layer decision for the follow-up task).

## App-side changes in this task
Only `src/integrations/supabase/types.ts` is regenerated (new columns + new RPC signature). No component, hook, or server-function changes.

## Follow-up work this unblocks (not in this task)
Trash/recover UI, a purge scheduler (cron endpoint calling `purge_due_entities`), and filtering trashed pages out of navigation/search lists all require a separate task.

## Docs
- `docs/architecture/database.md`: new columns, registry table, trigger, RPC, migration timeline row.
- Short note in the pinned-entities revocation section that trashing also unpins.

## Version
Bump `src/lib/version.ts` to `0.3.134` unless you prefer another number.

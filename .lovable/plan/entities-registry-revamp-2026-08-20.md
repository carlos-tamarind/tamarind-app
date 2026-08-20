# Entities Registry Revamp

Database-only work: reshape the `entities` registry so an entity row shares the exact id of its source asset (page, message, conversation, workspace user), backfill existing assets, and keep the registry in sync automatically from now on.

## Pre-flight verified

- `entities` = 0 rows, `entity_annotations` = 0 rows → safe to reshape and drop.
- `entity_types` currently has `message`, `page`, `user` (no `conversation` yet).
- Rows to backfill: pages 29, messages 104, conversations 4, workspace_users 3.
- No application code references `entities`, `entity_annotations`, or `entity_id` today, so this is DB + types + docs only.

## Migration 1 — Schema reshape

- Drop `entity_annotations` (policy, trigger, indexes, table) and the `annotation_type` enum.
- Insert the `conversation` entity type (idempotent on `key`).
- Drop `idx_entities_source`, `idx_entities_embedding`, `idx_entities_title_fts`, and the `(workspace_id, entity_type_id, source_id)` unique constraint.
- Drop `entities.source_id`, `entities.title`, `entities.embedding`; drop the default on `entities.id` so it must be supplied explicitly.
- Add `idx_entities_workspace_type (workspace_id, entity_type_id)`; keep `idx_entities_workspace`.
- Add table/column comments documenting the shared-id invariant. RLS policies and grants stay as-is.

## Migration 2 — Backfill

Insert one `entities` row per existing page, message, conversation and workspace user, using the source PK as `entities.id`, `entity_types.key` lookups (no hardcoded ids), original timestamps, and creator mapping (`messages.author_workspace_user_id`, NULL for workspace users). `ON CONFLICT (id) DO NOTHING`.

Verification: per-type entity counts must match 29 / 104 / 4 / 3.

## Migration 3 — Lifecycle triggers

- `entity_type_id_for(text)` STABLE SECURITY DEFINER helper, execute granted to `service_role` only.
- `sync_entity_from_page` / `_message` / `_conversation` / `_workspace_user` SECURITY DEFINER trigger functions handling INSERT (create entity row) and DELETE (remove entity row); AFTER INSERT OR DELETE FOR EACH ROW triggers on each source table.
- No UPDATE triggers (id and workspace_id are immutable in practice).
- `REVOKE ALL … GRANT EXECUTE TO service_role` on every function, matching existing migration style.

Deleting a source row now removes its entity row, cascading `entity_relations`.

## Post-migration

- Regenerate `src/integrations/supabase/types.ts`.
- Update `docs/architecture/database.md`: remove `entity_annotations` and `annotation_type`, describe the shared-id `entities` registry, add the `conversation` type, drop removed indexes.
- Update the README knowledge-graph bullet (remove `entity_annotations`).
- Bump `src/lib/version.ts` to 0.3.1.

## Out of scope

`entity_relations`, `pinned_assets` migration to `entity_id`, dropping `pages.entity_id` / `messages.entity_id`, and any feature code. Forward-only: rollback would require dropping triggers, truncating `entities`, and restoring dropped columns.

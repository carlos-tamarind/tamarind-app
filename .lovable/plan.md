# Pinned entities: replace the unused pinned_assets table

Scope for this step is database-only, plus documentation and regenerated types. No app/UI wiring — that will be notified and planned separately.

## What changes

Drop the unused polymorphic `pinned_assets` table (nothing in the app reads or writes it; only the generated types mention it) and its `pinned_asset_type` enum, replacing them with an entity-registry-backed `pinned_entities` table.

Pins are per workspace user, survive sessions, and disappear automatically when the pinned item is deleted, when the user leaves the workspace, or when they lose access to it.

## Schema

Single migration:

1. Drop `pinned_assets` policies, the table, and the `pinned_asset_type` enum.
2. Create `pinned_entities`:
   - `id` uuid PK, default `gen_random_uuid()`
   - `workspace_id` uuid NOT NULL → `workspaces(id)` ON DELETE CASCADE
   - `workspace_user_id` uuid NOT NULL → `workspace_users(id)` ON DELETE CASCADE
   - `entity_id` uuid NOT NULL → `entities(id)` ON DELETE CASCADE
   - `created_at` timestamptz NOT NULL DEFAULT now()
   - UNIQUE `(workspace_user_id, entity_id)`
3. Index `(workspace_id, workspace_user_id, created_at DESC)`.
4. Grants: `SELECT, INSERT, DELETE` to `authenticated`; `ALL` to `service_role`. No UPDATE anywhere.
5. Enable RLS.

Entity kind is never denormalized: it is resolved by joining `entities.entity_type_id → entity_types.key`, same convention as `conversation_suggestions`.

## Guards

**BEFORE INSERT trigger (SECURITY DEFINER)** — the real guard, because server functions use the admin client and bypass RLS:

- resolve `entity_types.key` for `NEW.entity_id`; only `conversation` and `page` are pinnable (messages, users, page chunks raise).
- require `entities.workspace_id = NEW.workspace_id`.
- require the workspace user to belong to that workspace.
- `conversation` → `is_conversation_participant_as(entity_id, workspace_user_id)`.
- `page` → `can_read_page_as(entity_id, workspace_user_id)`.
- otherwise raise.

**RLS for authenticated:**

- SELECT / DELETE: `workspace_user_id = current_workspace_user_id(workspace_id)` and workspace membership.
- INSERT WITH CHECK: same ownership, plus the session helpers `is_conversation_participant` / `can_read_page`. The `_as` variants stay `service_role`-only.

**Access-revocation triggers** (CASCADE from `entities` and `workspace_users` already covers deletion and leaving a workspace):

- AFTER DELETE on `conversation_participants`: unpin that conversation for that workspace user, then unpin any pages they can no longer read (`can_read_page_as`, so workspace-visible and collaborator pages survive).
- AFTER DELETE on `page_collaborators`: unpin that page for that user when `can_read_page_as` is now false.
- AFTER UPDATE OF `visibility`, `owner_workspace_user_id`, `conversation_id` on `pages`: delete pins for that entity where `can_read_page_as(page_id, workspace_user_id)` is false.

Pinning never writes to `conversations` or `pages`.

## Docs and types

- Add `pinned_entities` to `docs/architecture/database.md`: table description, index, RLS/grant summary, the "entity typing is not denormalized" note, revocation triggers, and a migration-timeline row.
- Regenerate `src/integrations/supabase/types.ts` after the migration so `pinned_assets` / `pinned_asset_type` are gone and `pinned_entities` is present.

## Not in this step

Nav sections, headers, and details dialogs stay as they are; the client-side intersection with `listMyConversations` / `listMyPages` belongs to the follow-up app wiring.

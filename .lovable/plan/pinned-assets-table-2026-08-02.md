# Pinned assets table

Add a `pinned_assets` table so each user can pin conversations and pages inside a workspace. Polymorphic: `asset_id` points at either a conversation or a page, with no foreign key.

## Schema

- `id` — uuid, primary key, defaults to a generated id
- `user_id` — uuid, required, references the auth user, removed when the user is deleted
- `workspace_id` — uuid, required, references the workspace, removed when the workspace is deleted
- `asset_type` — new enum `pinned_asset_type` with values `conversation` and `page`, required
- `asset_id` — uuid, required, no foreign key (polymorphic)
- `created_at` — timestamptz, required, defaults to now

Uniqueness: one pin per (user, workspace, asset_type, asset_id) to prevent duplicates.

Index: `idx_pinned_assets_workspace_user` on `(workspace_id, user_id, created_at DESC)`.

## Access rules

- Signed-in users can view, create, and remove only their own pins, and only in workspaces they belong to (checked with the existing workspace membership helper).
- No anonymous access.
- Service role retains full access for server-side work.

## Technical notes

- Delivered as a single migration: create enum, create table, grants to `authenticated` (select/insert/delete) and `service_role`, enable RLS, add policies, then create the index.
- `user_id` references `auth.users(id) ON DELETE CASCADE`, per the requested spec.
- No `updated_at` column or trigger: rows are insert/delete only.
- No application code changes in this step; the table is schema-only until pinning UI is wired up.

# Page-chunk deeplinks — database preparations

Make page chunks first-class entities so a future `?p=&k=` deeplink has a stable, cascading identity, and expose the winning chunk id from semantic page search. Database + generated types + docs only; no UI or search-behaviour changes.

## Accepted identity model

A chunk row lives only while its checksum matches. Re-chunking deletes the old UUID and inserts a new one, so its entity row disappears with it and a `?k=` link to a passage that no longer exists goes stale by design. No ProseMirror `from`/`to` columns.

## 1. Register the new entity type

Insert `('page_chunk', 'Page chunk')` into `entity_types` (idempotent, `ON CONFLICT (key) DO NOTHING`).

## 2. Backfill existing chunks

Insert one `entities` row per existing `page_chunks` row, using the chunk id as the entity id, `pages.workspace_id` and `pages.created_by_workspace_user_id` from the joined page, and the chunk's `created_at` / `updated_at`. `ON CONFLICT (id) DO NOTHING`.

## 3. Lifecycle trigger

`public.sync_entity_from_page_chunk()` — SECURITY DEFINER, `search_path = public`, execute granted to `service_role` only, matching the existing `sync_entity_from_message` shape:

- INSERT: insert the entity, resolving `workspace_id` / `created_by_workspace_user_id` via a lookup on `pages` (chunks carry no workspace column), `ON CONFLICT (id) DO NOTHING`.
- DELETE: `DELETE FROM public.entities WHERE id = OLD.id`.
- No UPDATE branch — id is immutable; checksum/position changes keep the same entity.

Attached as `trg_sync_entity_from_page_chunk` AFTER INSERT OR DELETE FOR EACH ROW on `public.page_chunks`.

Because `page_chunks` cascades from `pages`, deleting a page removes its chunks and, through this trigger, their entity rows.

## 4. Expose `chunk_id` from `search_pages_semantic`

The function already picks one winning chunk per page but does not return its id. Recreate it (Postgres requires DROP + CREATE to change the return signature) with an extra `chunk_id uuid` column carried through from the ranked chunk CTE. Everything else — arguments, weights, threshold, per-page collapsing, `STABLE`, `SECURITY INVOKER`, grants — stays byte-equivalent.

Adding a column is additive: the existing frontend row mapping ignores unknown fields, so search results keep behaving exactly as today. Wiring `chunk_id` into the overlay link is the out-of-scope follow-up.

## 5. Suggestions table (future, not built here)

Recorded as a contract note only: when that table lands it should allow `entity_type = 'page_chunk'`, FK `entity_id → entities(id) ON DELETE CASCADE`, and expose `page_id` (join at read time or denormalize).

## 6. Non-DB follow-ups included

- Regenerate `src/integrations/supabase/types.ts` so the RPC return type includes `chunk_id`.
- Update `docs/architecture/database.md`: `page_chunk` entity type, new sync trigger row in the lifecycle paragraph, migration-timeline entry, and the `search_pages_semantic` description.
- Update `docs/search/semantic.md` (and `docs/search/readme.md` where the RPC columns are listed) to mention the returned `chunk_id`.
- Bump `src/lib/version.ts`.

## Explicitly out of scope

No changes to `SemanticSearchStrategy`, `SearchResult`, the search overlay, routes, or the chunking/embedding workers.

## Open item

Version bump target: patch increment to `0.3.11` unless you want a different number.

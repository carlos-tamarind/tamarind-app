# Database Schema

The database is PostgreSQL hosted on Supabase. Schema is defined in SQL migrations under [`supabase/migrations/`](../../supabase/migrations/). TypeScript types are generated in [`src/integrations/supabase/types.ts`](../../src/integrations/supabase/types.ts).

**Extensions:** `pgcrypto`, `vector` (pgvector), `pg_cron`, `pg_net`

## Entity Relationship Diagram

```mermaid
erDiagram
    workspaces ||--o{ workspace_users : has
    workspaces ||--o{ workspace_invites : has
    workspaces ||--o{ workspace_plan_history : has
    workspaces ||--o{ conversations : has
    workspaces ||--o{ pages : has
    workspaces ||--o{ messages : has
    workspaces ||--o{ entities : has

    user_roles ||--o{ workspace_users : assigns
    user_roles ||--o{ workspace_invites : assigns

    auth_users ||--o{ workspace_users : joins

    conversations ||--o{ conversation_participants : has
    conversations ||--o{ messages : contains
    conversations ||--o{ pages : links

    workspace_users ||--o{ conversation_participants : participates
    workspace_users ||--o{ messages : authors
    workspace_users ||--o{ pages : owns
    workspace_users ||--o{ page_collaborators : edits

    pages ||--o{ page_collaborators : has
    pages ||--o| pages : parent

    entity_types ||--o{ entities : types
    entities ||--o{ entity_annotations : source
    entities ||--o{ entity_annotations : target
    entities ||--o{ entity_relations : source
    entities ||--o{ entity_relations : target

    messages ||--|| message_semantics : has
    message_semantics ||--o{ message_embeddings : has

    pages ||--o{ page_chunks : has
    page_chunks ||--o{ page_embeddings : has
```

## Enums

| Enum | Values |
|------|--------|
| `plan_tier` | `free`, `pro`, `enterprise` |
| `workspace_role` | `admin`, `member`, `viewer` |
| `conversation_role` | `admin`, `member`, `viewer` |
| `conversation_type` | `direct`, `group`, `channel` |
| `page_visibility` | `private`, `conversation`, `workspace`, `external` |
| `page_type` | `standard`, `template`, `generated`, `imported` |
| `page_origin` | `user`, `conversation`, `import`, `ai` |
| `annotation_type` | `mention_user`, `mention_entity`, `ticket_ref`, `inline_page_match`, `semantic_hint` |
| `relation_type` | `quoted_from`, `derived_from_message`, `cited_in`, `child_of`, `attached_to`, `linked_by_user` |
| `embedding_status` | `NEW`, `QUEUED`, `PROCESSING`, `EMBEDDED`, `FAILED`, `SKIPPED` |
| `page_embedding_status` | `QUEUED`, `PROCESSING`, `RETRY_WAIT`, `EMBEDDED`, `FAILED` |

## Tables

### Workspace & Membership

| Table | Purpose | Key relationships |
|-------|---------|-------------------|
| `workspaces` | Tenant root; holds `plan` tier | — |
| `workspace_plan_history` | Audit trail of plan changes | → `workspaces`, → `auth.users` |
| `user_roles` | Role catalog (`admin`, `member`, `viewer`) with JSON permissions | — |
| `workspace_users` | Links `auth.users` to workspace with role | → `workspaces`, → `auth.users`, → `user_roles`; UNIQUE(workspace_id, user_id) |
| `workspace_invites` | Token-based email invites (24h TTL) | → `workspaces`, → `user_roles` |

### Conversations & Messages

| Table | Purpose | Key relationships |
|-------|---------|-------------------|
| `conversations` | Chat threads (direct, group, channel) | → `workspaces`, → `workspace_users` (created_by) |
| `conversation_participants` | Membership in a conversation | → `conversations`, → `workspace_users`; PK(conversation_id, workspace_user_id) |
| `messages` | Chat messages with TipTap/HTML raw text | → `workspaces`, → `conversations`, → `workspace_users` (author), → `entities` (optional) |

### Pages

| Table | Purpose | Key relationships |
|-------|---------|-------------------|
| `pages` | Rich-text documents (TipTap JSON) | → `workspaces`, → `workspace_users` (owner, created_by), → `conversations`, → `pages` (parent), → `entities` (optional) |
| `page_collaborators` | Tracks who edited a page | → `pages`, → `workspace_users`; PK(page_id, workspace_user_id) |
| `page_chunks` | Chunked page text for semantic indexing (`position`, `content`, `checksum`, `token_count`) | → `pages` (CASCADE); UNIQUE(page_id, position) |

`pages.plain_text` is a generated column via `tiptap_to_plaintext(doc)` for full-text search.

`page_chunks.checksum` is a hex SHA-256 supplied by the app and is **not** globally unique — the same text can appear on many pages. `position` is ordering only, never identity: reconciliation must delete/reinsert rows rather than update by position, and deleting a chunk cascades away its embeddings.

### Semantic Layer (Schema-Ready)

| Table | Purpose | Key relationships |
|-------|---------|-------------------|
| `entity_types` | Catalog: `page`, `message`, `user` | — |
| `entities` | Unified knowledge objects with optional `embedding vector(1536)` | → `workspaces`, → `entity_types`; UNIQUE(workspace_id, entity_type_id, source_id) |
| `entity_annotations` | Links between entities (mentions, refs) | → `entities` (source/target), → `workspaces` |
| `entity_relations` | Directed relations between entities | → `entities` (source/target); UNIQUE per relation type |

> **Note:** These tables exist with pgvector and full-text indexes, but **no application code reads or writes them yet**. They are schema-ready for a future knowledge graph layer.

### Embedding Pipeline

| Table | Purpose | Key relationships |
|-------|---------|-------------------|
| `message_semantics` | Normalized text, quality score, embedding queue state | → `messages` (1:1, CASCADE); UNIQUE(message_id), UNIQUE(checksum) |
| `message_embeddings` | Vector embeddings for semantic search | → `message_semantics` (CASCADE); `embedding_vector vector(1536)` |
| `page_embeddings` | Vector + queue state per page chunk | → `page_chunks` (CASCADE); UNIQUE(chunk_id, embedding_model); `embedding vector(1536)` |

**Page embedding queue.** `page_embeddings` carries its own state machine (`page_embedding_status`: `QUEUED` → `PROCESSING` → `EMBEDDED` / `RETRY_WAIT` / `FAILED`) plus `attempts`, `next_retry_at`, `last_error`, `embedded_at`. `embedding` is NULL until a successful embed; a CHECK enforces that an `EMBEDDED` row has a vector. Re-embedding updates the existing `(chunk_id, embedding_model)` row instead of inserting.

**Naming split.** Page rows use `embedding` / `embedding_model`; the older `message_embeddings` uses `embedding_vector` / `model`. The two enums are deliberately separate so page states (`RETRY_WAIT`) never leak into message/CTI predicates.

**Access.** `page_chunks` and `page_embeddings` grant `SELECT` to `authenticated` and `ALL` to `service_role`. RLS allows SELECT only, gated by `EXISTS (… FROM public.pages …)` so the existing page visibility policy (private / conversation / collaborator / workspace / external) applies without duplication. All writes go through the service-role pipeline.

## Key Indexes

| Index | Table | Type | Used by |
|-------|-------|------|---------|
| `idx_messages_conversation` | messages | `(conversation_id, created_at)` | Conversation message listing |
| `idx_messages_fts` | messages | GIN full-text on `raw_text` | *(legacy — not used by current search RPCs)* |
| `idx_pages_plaintext_fts` | pages | GIN full-text on `plain_text` | *(legacy — not used by current search RPCs)* |
| `idx_pages_title_trgm` | pages | GIN trigram on `title` | Keyword search |
| `idx_pages_content_trgm` | pages | GIN trigram on `plain_text` | Keyword search |
| `idx_conversations_title_trgm` | conversations | GIN trigram on `title` | Keyword search |
| `idx_messages_normalized_trgm` | message_semantics | GIN trigram on `normalized_text` | Keyword search |
| `idx_workspace_users_display_name_trgm` | workspace_users | GIN trigram on `display_name` | Keyword search (people) |
| `idx_entities_embedding` | entities | IVFFlat cosine on `embedding` | *(schema-ready — unused)* |
| `idx_message_embeddings_vector` | message_embeddings | HNSW cosine on `embedding_vector` | Semantic search |
| `idx_message_semantics_queue` | message_semantics | Partial: `(next_retry_at, created_at) WHERE status = 'QUEUED'` | Embedding worker |
| `idx_page_chunks_page_checksum` | page_chunks | `(page_id, checksum)` (non-unique) | Chunk reconciliation |
| `idx_page_embeddings_queue` | page_embeddings | `(embedding_status, next_retry_at, created_at)` | Queue inspection |
| `idx_page_embeddings_claimable` | page_embeddings | Partial: `(next_retry_at, created_at) WHERE status IN ('QUEUED','RETRY_WAIT')` | Page embedding worker |
| `idx_page_embeddings_vector` | page_embeddings | Partial HNSW cosine on `embedding` WHERE status = `'EMBEDDED'` | Future page semantic search |

## Database Functions

| Function | Purpose |
|----------|---------|
| `is_workspace_member(workspace_id)` | RLS: current user is a workspace member |
| `has_workspace_role(workspace_id, role)` | RLS: role check |
| `current_workspace_user_id(workspace_id)` | RLS: resolve workspace_users.id for auth user |
| `is_conversation_participant(conversation_id)` | RLS: conversation access |
| `is_page_collaborator(page_id)` | RLS: page collaborator check |
| `tiptap_to_plaintext(doc jsonb)` | Generated column helper for pages.plain_text |
| `set_last_modified_at()` | Trigger: auto-update last_modified_at |
| `claim_embedding_batch(batch_size, stale_after)` | Pipeline: atomic batch claim (service_role only) |
| `search_pages_keyword(...)` | Keyword search over page titles and content |
| `search_conversations_keyword(...)` | Keyword search over conversation titles |
| `search_messages_keyword(...)` | Keyword search over normalized message text |
| `search_people_keyword(...)` | Keyword search over participant display names |
| `search_messages_semantic(...)` | Semantic search over message embedding vectors |
| `escape_ilike_pattern(text)` | Escape helper for ILIKE patterns in keyword RPCs |

## Row-Level Security

RLS is enabled on all public tables. Most policies use the helper functions above to scope access by workspace membership and role.

Write patterns:
- **Authenticated users** — reads and writes scoped by RLS policies
- **Service role** — used server-side for bootstrap, message side-effects, and the embedding pipeline (no authenticated write policies on embedding tables)

## Realtime Publication

`messages` and `pages` are published to `supabase_realtime` for live client subscriptions.

## Migration Timeline

| Date | Change |
|------|--------|
| 2026-05-27 | Initial schema: all core tables, enums, RLS, indexes |
| 2026-05-28 | Confirm all auth users |
| 2026-06-03 | Add `conversation_type`, `image_url` to conversations |
| 2026-06-04 | Add `page_collaborators` |
| 2026-07-15 | Update page visibility RLS for collaborators |
| 2026-07-16 | Add `is_page_collaborator()` helper |
| 2026-07-18 | Allow users to update own workspace_users profile |
| 2026-07-22 | Add `message_semantics` + `embedding_status` enum |
| 2026-07-24 | Add `message_embeddings`, retry columns, queue indexes |
| 2026-07-29 | Drop `token_count`, add `claim_embedding_batch` RPC |
| 2026-07-30 | Enable `pg_cron`, `pg_net` |

## Related Docs

- [Overview](overview.md) — How the app accesses the database
- [Auth](auth.md) — RLS and permission model
- [Semantic Pipeline](../semantic/pipeline.md) — message_semantics and message_embeddings usage
- [Search & Retrieval](../search/readme.md) — Keyword and semantic search RPCs

# Mento — MVP Build Plan (revised)

A multi-tenant collaborative workspace with conversations, pages (TipTap), invite-only auth, and a semantic-ready (pgvector) foundation. The MVP intentionally avoids spending budget on real-time collaborative-editing mechanics; the moat is the **contextual knowledge graph**, **conversation ↔ page intelligence**, **semantic workspace memory**, and **discoverability**.

## 1. Foundation

- Enable Lovable Cloud (Supabase + Postgres + Realtime + pgvector + Storage).
- Extensions: `pgvector`, `pgcrypto`.
- Server-only secret `OPENAI_API_KEY` for embeddings (`text-embedding-3-small`, 1536d).
- `attachSupabaseAuth` registered in `src/start.ts`.

## 2. Database schema

All tables: `created_at` / `last_modified_at` (triggered). Multi-tenant tables: `workspace_id` + RLS.

### Identity
- `workspaces (id, name, plan plan_tier NOT NULL DEFAULT 'free', plan_updated_at, …)`
- `user_roles (id, key UNIQUE, description, permissions jsonb)` — seeded `admin`, `member`, `viewer`.
- `workspace_users (id PK, workspace_id, user_id → auth.users, role_id, UNIQUE(workspace_id, user_id))`
- `workspace_invites (id, workspace_id, email, role_id, token UNIQUE, invited_by_workspace_user_id, expires_at, accepted_at NULL)`

### Conversations
- `conversations (id, workspace_id, title, created_by_workspace_user_id, …)` — **no `entity_id` column** (removed for MVP; conversations aren't first-class semantic entities yet).
- `conversation_participants (conversation_id, workspace_user_id, role ENUM[admin|member|viewer], joined_at, PK(...))`
- `messages (id, workspace_id, conversation_id, entity_id, author_workspace_user_id, raw_text, …)`

### Pages
- `pages (id, workspace_id, entity_id, owner_workspace_user_id, conversation_id NULL, visibility ENUM[private|conversation|workspace|external], page_type ENUM[standard|template|generated|imported], parent_page_id NULL, origin_type ENUM[user|conversation|import|ai], origin_source_id NULL, title, content jsonb, created_by_workspace_user_id, …)`
- **`content` is a full TipTap (ProseMirror) JSON document.** Not a block container, not segmented per-block. Block-level abstractions are deferred to post-MVP.

### Semantic layer
- `entity_types (id, key UNIQUE, display_name)` — seeded `page`, `message`, `user`.
- `entities (id, workspace_id, entity_type_id, source_id, title, metadata jsonb, embedding vector(1536) NULL, created_by_workspace_user_id, …)`.
  - **`source_id` clarified**: the primary key of the canonical domain row this entity *represents*, scoped by `entity_type_id`. E.g. `page` → `pages.id`; `message` → `messages.id`; `user` → `workspace_users.id`. `UNIQUE(workspace_id, entity_type_id, source_id)` guarantees one entity per domain row.
- `entity_annotations (id, workspace_id, source_entity_id, target_entity_id NULL, annotation_type, raw_text, start_offset, end_offset, metadata jsonb, confidence, created_by_workspace_user_id, …)`
  - **Textual references inside an entity's content** (not just @mentions). `annotation_type` open-ended: `mention_user`, `mention_entity`, `ticket_ref`, `inline_page_match`, `semantic_hint`. `target_entity_id` nullable so unresolved references still record their span.
- `entity_relations (id, workspace_id, source_entity_id, target_entity_id, relation_type, metadata jsonb, created_by_workspace_user_id NULL, created_at, …)` — **IN SCOPE for MVP, but strictly gated**.
  - `relation_type` enum (open-ended): `quoted_from`, `derived_from_message`, `cited_in`, `child_of`, `attached_to`, `linked_by_user`.
  - `UNIQUE(workspace_id, source_entity_id, target_entity_id, relation_type)` to avoid dupes.

### Three-layer model (rule of thumb)

| Layer | Purpose | Written by (MVP) |
|---|---|---|
| `entity_relations` | **Explicit structural links** in user content | Only explicit user actions + deterministic system events |
| `entity_annotations` | **Textual references** inside content (mentions, refs, hints) | Parsers on save (server-side); high-confidence only |
| `entities.embedding` (pgvector) | **Similarity / meaning** | Embedding pipeline (pages only in MVP) |

### MVP write rules for `entity_relations` (strict)

Writes happen only from these code paths:
1. **Explicit user actions** — e.g. "Quote page A from page B", "Link this page to that page", "Attach page to conversation". Each action calls a single server fn (`createEntityRelation`) that records `created_by_workspace_user_id` and a fixed `relation_type`.
2. **Deterministic system events** — same transaction as the originating write:
   - "Page from selected paragraphs" → `derived_from_message` rows from new page → each source message.
   - Page attached to a conversation on create → `attached_to` row.
   - Page-in-page citation block inserted via a first-class TipTap citation node → `cited_in` row.
3. **Very high-confidence structured signals** — only when the signal is unambiguous and produced by the same transaction that created the structural artifact (e.g. a typed `<page-link id="…">` node committed in the editor → `linked_by_user`).

**Explicitly forbidden in MVP** (enforced by code review + absence of any such code path):
- No AI/LLM-driven relation writes.
- No semantic / embedding-similarity inference writes.
- No fuzzy text-matching writes (those belong in `entity_annotations` with `confidence < 1`).
- No background job that scans content and synthesizes relations.

`entity_relations` is a **supporting structure**, not an intelligence layer. The intelligence layer is annotations + embeddings + search, which compose on top.

### Indexes & FTS
- IVFFlat (cosine) index on `entities.embedding`.
- `tsvector` on `entities.title`, `messages.raw_text`, and a generated `pages.plain_text` column derived from TipTap JSON.
- B-tree on `entity_relations (workspace_id, source_entity_id)` and `(workspace_id, target_entity_id)`.

### RLS
- `has_workspace_role(_ws, _role)` SECURITY DEFINER helper. Policies scope by membership; conversations check participants; pages check visibility + participation + ownership. `entity_relations` scoped by workspace + both endpoints' visibility to the caller. `service_role` used only inside server fns.

## 3. Auth & invite flow

- Supabase Auth, public signup disabled.
- `workspace_invites` → email link → `/accept-invite?token=…` validates, creates `auth.users` + `workspace_users` + marks invite accepted in one transaction.
- One-time `/bootstrap` for first admin/workspace.
- `/login`, `/forgot-password`, `/reset-password`.

## 4. App shell & routing

Fixed three-panel layout (same in MVP and post-MVP), built with `react-resizable-panels`:

```text
┌──────────┬──────────────┬─────────────────────────────────────────┐
│ Workspc  │  Sidebar     │  Center panel                            │
│ rail     │  [Convs|Pgs] │  (conversation, page, or both)           │
│ 10%      │  20%         │  70% (or 80% when rail hidden)           │
│ hideable │              │                                          │
└──────────┴──────────────┴─────────────────────────────────────────┘
```

- **Workspace rail (left, 10%, hideable)**: vertical list of all workspaces the user belongs to.
- **Sidebar (20%)**: `Conversations` / `Pages` tabs, filtered by participation + visibility. Bottom: Settings, Profile, status.
- **Center panel**:
  - Only conversation → fills panel.
  - Only page → fills panel.
  - Both → conversation 30% / page 50% of total screen width (resizable, persisted).
- **Settings modal**: overlay on top of center panel with darkened backdrop.

### Routes
```text
src/routes/
  __root.tsx, index.tsx, login.tsx, accept-invite.tsx, forgot-password.tsx, reset-password.tsx
  _authenticated.tsx
    w.$workspaceId.tsx                            (3-panel shell)
      w.$workspaceId.index.tsx
      w.$workspaceId.c.$conversationId.tsx
      w.$workspaceId.p.$pageId.tsx
      w.$workspaceId.c.$conversationId.p.$pageId.tsx
      w.$workspaceId.settings.tsx + children      (modal overlay)
```

## 5. Conversations

- Create 1:1 / group conversation server fn (row + participants in one tx).
- `sendMessage` server fn: single tx inserts `entities (type=message, source_id=<message_id>)` then `messages` with `entity_id`. Embedding job enqueued, disabled for messages in MVP.
- Realtime subscription on `messages` filtered by `conversation_id`.
- Annotation extraction runs server-side after insert: parses `raw_text` for `@user`, explicit page links, and ticket-style identifiers → `entity_annotations` rows.

## 6. Pages (TipTap) — deliberately lightweight

**No collaborative-editing primitives in MVP.** No block locks, no lock-refresh Realtime, no Yjs, no per-block ownership.

- `@tiptap/react` + starter-kit + placeholder. `pages.content` = full TipTap JSON document.
- **Save strategy: last-write-wins.** Debounced 1.5s autosave via `savePage`. Server overwrites `content`; no merge, no version branch, no conflict UI.
- **Presence (lightweight, presentational only):**
  - Per-page Supabase Realtime *presence channel* (`page:<pageId>`). On mount, client tracks `{ workspaceUserId, name, avatarUrl, caretAnchor? }`. No DB table.
  - **Top-right viewer indicator**: icon + count of other users on the page. Click opens dropdown listing names + avatars. Clicking a name is a no-op in MVP.
  - **Writing markers**: peers broadcast a throttled caret/selection anchor. Local editor renders a thin colored marker (name on hover). Purely visual; never mutates content. Idle (5s) → marker disappears.
- **"Page from selected paragraphs"**: creates a new page with `origin_type='conversation'`, `origin_source_id=<conversation_id>`, `conversation_id` set, `visibility='conversation'`, content built from selected messages as TipTap paragraphs. **In the same tx**, writes `entity_relations` rows: `derived_from_message` from the new page entity → each source message entity, and `attached_to` from the new page → conversation.
- **Page quoting / linking**: dedicated TipTap nodes (`page-quote`, `page-link`) committed in the editor trigger a server fn that writes a corresponding `quoted_from` / `linked_by_user` `entity_relations` row alongside the save. Deleting the node removes the relation.
- Visibility selector on page header: private / conversation / workspace / external.

## 7. Search (discoverability is a moat pillar)

- Single `search` server fn runs in parallel:
  - Postgres FTS over `pages.plain_text`, `messages.raw_text`, `workspace_users` profile fields.
  - Vector ANN over `entities.embedding` (pages only in MVP).
- All results filtered server-side by workspace membership, conversation participation, ownership, visibility.
- Result grouping by entity type; preview snippets surface matched annotations when present. Related-entity hints can use `entity_relations` for cheap traversal (post-MVP UI).

## 8. Embeddings pipeline

- `embedPage` server fn called after `savePage` (fire-and-forget). Extracts plaintext from TipTap JSON → OpenAI embedding → write `entities.embedding`. Skipped on unchanged content hash. Failures logged, never block saves.
- Message embeddings: schema-ready, not enabled in MVP.

## 9. Roles enforcement

- `admin`: full CRUD on workspace, members, invites, all pages/conversations.
- `member`: create/edit own pages, participate in invited conversations, search.
- `viewer`: read-only on visible content.
- Enforced in server fns (`has_workspace_role`) + RLS backstop.

## 10. Subscription & feature gating

Workspace-scoped plans, **server-side enforcement on every protected action**. Frontend gating is UX only.

- `workspaces.plan plan_tier` enum (`free | pro | enterprise`), default `free`.
- `workspace_plan_history` append-only audit.
- `src/lib/features.ts` capability map shared by client + server (e.g. `pages.create`, `pages.unlimited`, `conversations.group`, `search.semantic`, `invites.unlimited`, `workspace.externalShare`, `ai.suggestions` (post-MVP)).
- Server: `getWorkspacePlan`, `hasFeature`, `requireFeature` middleware throwing typed `FeatureGateError`. Applied to **every protected server fn from the first commit**.
- Admin-only `setWorkspacePlan` server fn via `supabaseAdmin`, writes history, invalidates cache.
- Client: `useWorkspacePlan()` + `useFeature()` hooks (TanStack Query). UI hides/disables gated actions, surfaces upgrade modal on `FeatureGateError`.
- **Rule**: hiding a button is never the only check. **Deferred**: usage quotas, billing, self-serve upgrade UI, per-feature soft limits, flag overrides.

## 11. Explicitly deferred to post-MVP

Channels, page version history, **collaborative editing (Yjs, block locks, lock refresh)**, block-level page model, notifications, reminders, file uploads, AI summaries/suggestions, message embeddings, **AI- or similarity-driven `entity_relations` writes**, semantic auto-linking, external user provisioning UI, calls, shortcuts, usage quotas, billing, ticket-reference resolution.

## Technical notes

- All sensitive reads/writes via `createServerFn` + `requireSupabaseAuth` (+ `requireFeature` where gated). `supabaseAdmin` only for invite acceptance, embeddings, bootstrap, plan mutation.
- `embedding vector(1536)` matches `text-embedding-3-small`; model switch is a re-embed migration.
- Shared `set_last_modified_at` trigger across all tables.
- Panel sizes via `react-resizable-panels`, persisted to localStorage per workspace.
- Presence channel payloads throttled (~10/s, drop under load) so writing markers never become a hot path.
- `pages.plain_text` is a generated column derived from `content` (TipTap JSON → text) for FTS.
- `entity_relations` writes always live in the same transaction as the originating user action or system event; there is no async "relation builder" service in MVP.

Approve this and I'll start with the schema migration (incl. `plan_tier`, `workspace_plan_history`, broadened `entity_annotations`, scoped `entity_relations`, removed `conversations.entity_id`) and the auth shell, then the three-panel layout, then conversations, then pages (TipTap + last-write-wins + presence/markers + quote/link nodes → relations), then search + embeddings.
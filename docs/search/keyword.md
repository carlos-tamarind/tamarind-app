# Keyword Search

Keyword search finds workspace assets by substring containment and ranks matches using PostgreSQL trigram similarity. It is the primary strategy for pages, conversations, message text, and people.

**Strategy class:** [`KeywordSearchStrategy`](../../src/search/strategies/keywords/KeywordSearchStrategy.ts)

## Mechanism

Keyword search does **not** use BM25, `ts_rank`, or the legacy GIN full-text indexes on `messages.raw_text` and `pages.plain_text`. Instead, each RPC:

1. Filters rows with **ILIKE** `'%query%'` (pattern escaped via `escape_ilike_pattern`)
2. Scores matches with **`similarity()`** from the `pg_trgm` extension
3. Returns the top rows ordered by score

Existing GIN trigram indexes accelerate ILIKE for patterns of 3+ characters:

| Index | Column |
|-------|--------|
| `idx_pages_title_trgm` | `pages.title` |
| `idx_pages_content_trgm` | `pages.plain_text` |
| `idx_conversations_title_trgm` | `conversations.title` |
| `idx_messages_normalized_trgm` | `message_semantics.normalized_text` |
| `idx_workspace_users_display_name_trgm` | `workspace_users.display_name` |

**Migration:** [`20260807183135_8790d26a-b7ba-449c-b8a0-c28ad10fb094.sql`](../../supabase/migrations/20260807183135_8790d26a-b7ba-449c-b8a0-c28ad10fb094.sql)

## Scope → RPC Matrix

The strategy selects RPCs based on [`SearchScope`](../../src/search/types.ts):

| Scope | RPCs called |
|-------|-------------|
| `all` | `search_pages_keyword`, `search_conversations_keyword`, `search_messages_keyword`, `search_people_keyword` |
| `pages` | `search_pages_keyword` |
| `conversations` | `search_conversations_keyword`, `search_messages_keyword` |
| `users` | `search_people_keyword` |

All RPCs receive:

```typescript
{
  p_workspace_id: request.workspaceId,
  p_query: request.query,
  p_limit: request.limit  // 20
}
```

RPCs run in parallel via `Promise.allSettled`. A failing RPC is logged and skipped; other RPCs in the same scope still contribute results.

## RPC Details

### `search_pages_keyword`

| Field | Source |
|-------|--------|
| Corpus | `pages.title`, `pages.plain_text` |
| Score | `greatest(similarity(title), similarity(plain_text))` |
| `matched_field` | `title` or `content` — whichever scored higher |
| `asset_id` | Page UUID |

Mapped to `SearchResult` with `assetType: "page"`.

### `search_conversations_keyword`

| Field | Source |
|-------|--------|
| Corpus | `conversations.title` |
| Score | `similarity(title, query)` |
| `matched_field` | `title` |
| `asset_id` | Conversation UUID |

Mapped to `SearchResult` with `assetType: "conversation"`.

### `search_messages_keyword`

| Field | Source |
|-------|--------|
| Corpus | `message_semantics.normalized_text` (joined to `messages`) |
| Score | `similarity(normalized_text, query)` |
| `matched_field` | `content` |
| `asset_id` | Message UUID |
| `conversation_id` | Parent conversation |

Mapped to `SearchResult` with `assetType: "message"`.

Only messages that passed normalization and were persisted to `message_semantics` are searchable. Raw message text is not queried directly.

### `search_people_keyword`

| Field | Source |
|-------|--------|
| Corpus | `workspace_users.display_name` |
| Match logic | Finds conversations where the named user is a participant |
| Score | Best name similarity per conversation |
| `matched_field` | `name` |
| `asset_id` | Conversation UUID (not the user UUID) |

Mapped to `SearchResult` with `assetType: "conversation"`. People search surfaces **conversations involving that person**, not user profile records.

## App-Side Ranking

After all RPCs in scope complete:

1. Concatenate results from successful RPCs
2. Sort by score descending
3. Slice to `request.limit` (20)

This is a second ranking pass on top of each RPC's internal `ORDER BY score DESC LIMIT`.

## Snippets

Content matches get a contextual snippet via [`extractSnippet`](../../src/search/utils/snippet.ts):

| Parameter | Value |
|-----------|-------|
| Min length | 80 characters |
| Max length | 180 characters |
| Logic | Find query in text; prefer sentence boundaries; pad or truncate with ellipses |

Title matches for pages and conversations use the title directly rather than a generated snippet.

## Security

All keyword RPCs are `SECURITY INVOKER` with `search_path = public, extensions`. RLS on underlying tables restricts results to assets the authenticated user can access within the workspace.

## Related Docs

- [Search Pipeline](pipeline.md) — How keyword fits into the orchestrator
- [Semantic Search](semantic.md) — Complementary vector strategy
- [Normalization](../semantic/msg_normalization.md) — How message text becomes searchable
- [Database Schema](../architecture/database.md) — Indexes and RPC listing

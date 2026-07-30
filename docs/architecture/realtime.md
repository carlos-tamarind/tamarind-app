# Realtime

Tamarind uses Supabase Realtime for live updates. There are no custom WebSocket servers, SSE endpoints, or third-party pub/sub services.

## Overview

```mermaid
flowchart LR
  subgraph server [Server]
    SF["sendMessage server fn"]
    Admin["supabaseAdmin INSERT"]
  end

  subgraph supabase [Supabase]
    PG["PostgreSQL messages table"]
    RT["Realtime pub/sub"]
  end

  subgraph client [Browser]
    CW["conversation-window.tsx"]
    PW["page-window.tsx"]
    Root["__root.tsx AuthSync"]
  end

  SF --> Admin --> PG
  PG --> RT
  RT --> CW
  RT --> PW
  Root -->|"auth change"| CW
  Root -->|"auth change"| PW
```

## Message Subscriptions

**File:** [`src/components/conversation/conversation-window.tsx`](../../src/components/conversation/conversation-window.tsx)

When a conversation is open, the component subscribes to Postgres changes on the `messages` table:

```typescript
supabase
  .channel(`messages:${conversationId}`)
  .on("postgres_changes", {
    event: "INSERT",
    schema: "public",
    table: "messages",
    filter: `conversation_id=eq.${conversationId}`,
  }, handler)
  .subscribe()
```

New messages inserted by any participant (via `sendMessage` server function) appear in the UI without a full refetch. Initial message history is loaded via React Query + `listMessages` server function; Realtime handles only subsequent INSERTs.

### Message send flow

```
User sends message
  → sendMessage (server fn)
  → supabaseAdmin INSERT into messages
  → Realtime postgres_changes event
  → conversation-window merges into liveMessages state
  → enqueueMessageSemanticsProcessing (background, not realtime)
```

## Page Presence

**File:** [`src/components/page/page-window.tsx`](../../src/components/page/page-window.tsx)

When a page is open, the component joins a Supabase Presence channel:

```typescript
supabase.channel(`page:${pageId}`)
  .on("presence", { event: "sync" }, handler)
  .subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await channel.track({ user_id, display_name, ... })
    }
  })
```

This shows which workspace members are currently viewing the same page. Presence state is ephemeral and not persisted to the database.

## Auth State Invalidation

**File:** [`src/routes/__root.tsx`](../../src/routes/__root.tsx)

`AuthSync` listens for Supabase auth state changes (`SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`):

- Invalidates the TanStack Router cache (re-runs route loaders)
- Invalidates all React Query caches

This ensures Realtime subscriptions and server function data reflect the current user after login, logout, or token refresh.

## Realtime Publication

Only two tables are published to Supabase Realtime (configured in migrations):

| Table | Client usage |
|-------|--------------|
| `messages` | INSERT subscription in conversation window |
| `pages` | Available for future content sync (presence used today) |

## What Is Not Realtime

- **Page content edits** — saved via server functions and beacon API; no live co-editing sync
- **Conversation list / page list** — refreshed via React Query, not Realtime
- **Semantic pipeline status** — background processing; no client notification
- **Workspace membership changes** — require navigation refresh or query invalidation

## Related Docs

- [Overview](overview.md) — Supabase client tiers
- [Conversations](../interface/conversations.md) — Chat UI
- [Pages](../interface/pages.md) — Page editor

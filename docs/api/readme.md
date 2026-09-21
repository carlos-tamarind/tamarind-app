# API Routes

Tamarind's primary backend interface is TanStack Start server functions (`createServerFn` in `src/lib/*.functions.ts`). REST routes exist for cases where server functions are not suitable.

## Route Summary

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/pages/save` | Bearer token in body | Beacon-based page autosave |
| POST | `/api/run-embedding-worker` | Dev-only | Manual embedding worker trigger |
| POST | `/api/public/internal/run-embedding-worker` | Secret header | Production embedding cron target |
| POST | `/api/run-cti-worker` | Dev-only | Manual CTI worker trigger |
| POST | `/api/public/internal/run-cti-worker` | Secret header | Production CTI cron target |
| POST | `/api/run-page-chunking-worker` | Dev-only | Manual page chunking worker trigger |
| POST | `/api/public/internal/run-page-chunking-worker` | Secret header | Production page chunking cron target |
| POST | `/api/run-purge-worker` | Dev-only | Manual purge worker trigger |
| POST | `/api/public/internal/run-purge-worker` | Secret header | Production purge cron target (hourly) |

## POST /api/pages/save

**File:** [`src/routes/api/pages.save.ts`](../../src/routes/api/pages.save.ts)

Flushes page content when the user closes or hides the browser tab. Uses the Beacon API, which cannot set custom headers, so the access token is passed in the request body.

**Request body:**

```json
{
  "accessToken": "jwt-token",
  "pageId": "uuid",
  "title": "optional string",
  "content": "optional TipTap JSON"
}
```

**Behavior:**
- Creates a user-scoped Supabase client with the provided token
- Validates page access via RLS
- Updates title and/or content
- Returns `200 ok` on success

**Called from:** [`page-window.tsx`](../../src/components/page/page-window.tsx) on `beforeunload` and `visibilitychange`.

## POST /api/run-embedding-worker

**File:** [`src/routes/api/run-embedding-worker.ts`](../../src/routes/api/run-embedding-worker.ts)

Manual trigger for the embedding worker during local development.

**Auth:** Returns 404 in production unless `VITE_DEBUG_LOGS=true`.

**Response:**

```json
{
  "batchesProcessed": 2,
  "messagesProcessed": 45
}
```

## POST /api/public/internal/run-embedding-worker

**File:** [`src/routes/api/public/internal/run-embedding-worker.ts`](../../src/routes/api/public/internal/run-embedding-worker.ts)

Production endpoint called by pg_cron via pg_net. See [Cron & Background Jobs](../cron/readme.md).

**Auth:** Requires `x-embedding-worker-secret` header matching `EMBEDDING_WORKER_SECRET` env var. Uses timing-safe comparison. Returns opaque 404 for invalid/missing secret.

**Response:**

```json
{
  "batchesProcessed": 3,
  "messagesProcessed": 128
}
```

## POST /api/run-cti-worker

**File:** [`src/routes/api/run-cti-worker.ts`](../../src/routes/api/run-cti-worker.ts)

Manual trigger for the CTI worker during local development.

**Auth:** Returns 404 in production unless `VITE_DEBUG_LOGS=true`.

**Response:**

```json
{
  "jobsProcessed": 12
}
```

## POST /api/public/internal/run-cti-worker

**File:** [`src/routes/api/public/internal/run-cti-worker.ts`](../../src/routes/api/public/internal/run-cti-worker.ts)

Production endpoint called by pg_cron via pg_net. See [Cron & Background Jobs](../cron/readme.md).

**Auth:** Requires `x-cti-worker-secret` header matching `CTI_WORKER_SECRET` env var. Uses timing-safe comparison. Returns opaque 404 for invalid/missing secret.

**Response:**

```json
{
  "jobsProcessed": 8
}
```

## POST /api/run-page-chunking-worker

**File:** [`src/routes/api/run-page-chunking-worker.ts`](../../src/routes/api/run-page-chunking-worker.ts)

Manual trigger for the page chunking worker during local development.

**Auth:** Returns 404 in production unless `VITE_DEBUG_LOGS=true`.

**Response:**

```json
{
  "pagesDue": 4,
  "processed": 4,
  "inserted": 12,
  "deleted": 1,
  "queued": 12,
  "errors": 0,
  "pageIds": ["uuid"]
}
```

## POST /api/public/internal/run-page-chunking-worker

**File:** [`src/routes/api/public/internal/run-page-chunking-worker.ts`](../../src/routes/api/public/internal/run-page-chunking-worker.ts)

Production endpoint called by pg_cron via pg_net. See [Cron & Background Jobs](../cron/readme.md).

**Auth:** Requires `x-page-chunking-worker-secret` header matching `PAGE_CHUNKING_WORKER_SECRET` env var. Uses timing-safe comparison. Returns opaque 404 for invalid/missing secret.

**Response:** Same shape as the dev endpoint.

## POST /api/run-page-embedding-worker

**File:** [`src/routes/api/run-page-embedding-worker.ts`](../../src/routes/api/run-page-embedding-worker.ts)

Manual trigger for the page embedding worker during local development.

**Auth:** Returns 404 in production unless `VITE_DEBUG_LOGS=true`.

**Response:**

```json
{
  "batchesProcessed": 1,
  "claimed": 20,
  "embedded": 19,
  "skipped": 1,
  "failed": 0,
  "topicClaimed": 4,
  "topicEmbedded": 4,
  "topicSkipped": 0,
  "topicFailed": 0
}
```

## POST /api/public/internal/run-page-embedding-worker

**File:** [`src/routes/api/public/internal/run-page-embedding-worker.ts`](../../src/routes/api/public/internal/run-page-embedding-worker.ts)

Production endpoint called by pg_cron via pg_net. See [Cron & Background Jobs](../cron/readme.md).

**Auth:** Requires `x-page-embedding-worker-secret` header matching `PAGE_EMBEDDING_WORKER_SECRET` env var. Uses timing-safe comparison. Returns opaque 404 for invalid/missing secret.

**Response:** Same shape as the dev endpoint.

## POST /api/run-page-semantic-worker

**File:** [`src/routes/api/run-page-semantic-worker.ts`](../../src/routes/api/run-page-semantic-worker.ts)

Manual trigger for the page semantic worker during local development.

**Auth:** Returns 404 in production unless `VITE_DEBUG_LOGS=true`.

**Response:**

```json
{
  "analyzed": 2,
  "skipped": 1,
  "failed": 0
}
```

## POST /api/public/internal/run-page-semantic-worker

**File:** [`src/routes/api/public/internal/run-page-semantic-worker.ts`](../../src/routes/api/public/internal/run-page-semantic-worker.ts)

Production endpoint called by pg_cron via pg_net. See [Cron & Background Jobs](../cron/readme.md).

**Auth:** Requires `x-page-semantic-worker-secret` header matching `PAGE_SEMANTIC_WORKER_SECRET` env var. Uses timing-safe comparison. Returns opaque 404 for invalid/missing secret, and 503 when the secret is unset.

**Response:** Same shape as the dev endpoint.

## POST /api/run-conversation-suggestion-worker

**File:** [`src/routes/api/run-conversation-suggestion-worker.ts`](../../src/routes/api/run-conversation-suggestion-worker.ts)

Manual trigger for the conversation suggestion worker during local development.

**Auth:** Returns 404 in production unless `VITE_DEBUG_LOGS=true`.

**Response:**

```json
{
  "enqueued": 0,
  "processed": 0,
  "suggested": 0,
  "failed": 0
}
```

Runs the conversation suggestion worker: sweep due pairs, claim jobs, LLM judge, persist.

## POST /api/public/internal/run-conversation-suggestion-worker

**File:** [`src/routes/api/public/internal/run-conversation-suggestion-worker.ts`](../../src/routes/api/public/internal/run-conversation-suggestion-worker.ts)

Production endpoint called by pg_cron via pg_net. See [Cron & Background Jobs](../cron/readme.md).

**Auth:** Requires `x-conversation-suggestions-worker-secret` header matching `CONVERSATION_SUGGESTIONS_WORKER_SECRET` env var. Uses timing-safe comparison. Returns opaque 404 for invalid/missing secret, and 503 when the secret is unset.

**Response:** Same shape as the dev endpoint.







## POST /api/run-purge-worker

**File:** [`src/routes/api/run-purge-worker.ts`](../../src/routes/api/run-purge-worker.ts)

Manual trigger for the purge worker during local development.

**Auth:** Returns 404 in production unless `VITE_DEBUG_LOGS=true`.

**Response:**

```json
{
  "purged": 0,
  "byType": {}
}
```

## POST /api/public/internal/run-purge-worker

**File:** [`src/routes/api/public/internal/run-purge-worker.ts`](../../src/routes/api/public/internal/run-purge-worker.ts)

Production endpoint called by pg_cron via pg_net, hourly. See [Cron & Background Jobs](../cron/readme.md).

**Auth:** Requires `x-purge-worker-secret` header matching `PURGE_WORKER_SECRET` env var. Uses timing-safe comparison. Returns opaque 404 for invalid/missing secret, and 503 when the secret is unset.

**Response:** Same shape as the dev endpoint.

## POST /api/public/internal/run-canonical-topics-worker

**File:** `src/routes/api/public/internal/run-canonical-topics-worker.ts`

Production endpoint called by pg_cron via pg_net, every minute. See [Cron & Background Jobs](../cron/readme.md).

**Auth:** Requires `x-canonical-topics-worker-secret` header matching `CANONICAL_TOPICS_WORKER_SECRET` env var. Uses timing-safe comparison. Returns opaque 404 for invalid/missing secret, and 503 when the secret is unset.

**Response:** `{ jobsProcessed, added, removed }`.

## Server Functions vs REST

| Use server functions when | Use REST routes when |
|---------------------------|---------------------|
| Called from React UI | Beacon/unload API needed |
| Typed RPC with auth middleware | External cron/scheduler calls |
| Standard CRUD operations | Direct utility endpoints |

Server functions are documented in their respective feature areas:
- [Conversations](../interface/conversations.md)
- [Pages](../interface/pages.md)
- [Workspaces](../interface/workspaces_permissions.md)

## Related Docs

- [Cron & Background Jobs](../cron/readme.md) — Embedding worker scheduling
- [Semantic Pipeline](../semantic/pipeline.md) — What the worker processes
- [Architecture Overview](../architecture/overview.md) — Server function pattern

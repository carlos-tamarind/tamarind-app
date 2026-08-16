# API Routes

Tamarind's primary backend interface is TanStack Start server functions (`createServerFn` in `src/lib/*.functions.ts`). REST routes exist for cases where server functions are not suitable.

## Route Summary

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/pages/save` | Bearer token in body | Beacon-based page autosave |
| POST | `/api/generate-embeddings` | None (JSON schema) | OpenAI embedding proxy |
| POST | `/api/run-embedding-worker` | Dev-only | Manual embedding worker trigger |
| POST | `/api/public/internal/run-embedding-worker` | Secret header | Production embedding cron target |
| POST | `/api/run-cti-worker` | Dev-only | Manual CTI worker trigger |
| POST | `/api/public/internal/run-cti-worker` | Secret header | Production CTI cron target |

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

## POST /api/generate-embeddings

**File:** [`src/routes/api/generate-embeddings.ts`](../../src/routes/api/generate-embeddings.ts)

Direct proxy to the OpenAI embeddings API. Validates input with Zod schema and returns embedding vectors.

**Request body:** Validated by `messageEmbeddingRequestSchema` in [`src/semantic/messages/message-embedding/types.ts`](../../src/semantic/messages/message-embedding/types.ts). Uses the message adapter [`generateMessageEmbeddingsFromRaw`](../../src/semantic/messages/message-embedding/generateMessageEmbeddings.ts), which delegates to the generic [`embeddingProvider`](../../src/semantic/embedding/embeddingProvider.ts).

**Auth:** None. Input validation only.

**Usage:** Utility endpoint for direct embedding generation, separate from the batch worker pipeline.

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

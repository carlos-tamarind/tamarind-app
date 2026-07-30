# Message Embedding

The embedding worker batch-processes queued messages, generates vector embeddings via OpenAI, and persists them for semantic search.

**Entry point:** [`runEmbeddingWorker`](../../src/semantic/embedding/runEmbeddingWorker.ts)

## Worker Flow

```mermaid
flowchart TD
  Cron["pg_cron POST\n/api/public/internal/run-embedding-worker"]
  Worker["runEmbeddingWorker"]
  Loop{"More batches?\n(max 10/tick)"}
  Claim["claim_embedding_batch RPC\n→ PROCESSING"]
  Empty{"Batch empty?"}
  OpenAI["OpenAI text-embedding-3-small"]
  Success{"Success?"}
  Persist["persistEmbeddings\n→ message_embeddings"]
  MarkEmbedded["markMessageSemanticsEmbedded\n→ EMBEDDED"]
  HandleError["handleEmbeddingBatchError"]
  Retry["requeue with backoff\n→ QUEUED"]
  Failed["markMessageSemanticsFailed\n→ FAILED"]

  Cron --> Worker --> Loop
  Loop --> Claim --> Empty
  Empty -->|yes| Done["Return stats"]
  Empty -->|no| OpenAI --> Success
  Success -->|yes| Persist --> MarkEmbedded --> Loop
  Success -->|no| HandleError
  HandleError --> Retry
  HandleError --> Failed
  Retry --> Loop
  Failed --> Loop
```

## Configuration

[`EMBEDDING_CONFIG`](../../src/semantic/embedding/config.ts):

| Parameter | Value |
|-----------|-------|
| `EMBEDDING_BATCH_SIZE` | 64 messages per batch |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` |
| `MAX_BATCHES_PER_TICK` | 10 |
| `MAX_RETRY_COUNT` | 10 |
| `BASE_DELAY_RETRY_MS` | 5,000 ms |
| `MAX_DELAY_RETRY_MS` | 600,000 ms (10 min) |

## Batch Claiming

[`claimEmbeddingBatch`](../../src/semantic/embedding/claimBatch.ts) calls the Postgres RPC `claim_embedding_batch`:

- Selects rows where `embedding_status = 'QUEUED'` and `next_retry_at <= now()`
- Atomically sets status to `PROCESSING`
- Returns claimed rows to the worker
- Stale PROCESSING rows (worker crash) are reclaimed after timeout

Only `service_role` can execute this RPC.

## Embedding Provider

[`embeddingProvider`](../../src/semantic/embedding/embeddingProvider.ts) is a pluggable interface. The active provider is OpenAI:

[`openAiEmbeddingProvider`](../../src/semantic/embedding/providers/openai/embeddings.server.ts) sends batch requests to the OpenAI embeddings API using `OPENAI_API_KEY`.

Provider interface:

```typescript
type EmbeddingProvider = {
  generate(params: {
    model: string;
    messages: { id: string; normalized_text: string }[];
  }): Promise<EmbeddingOutcome>;
};
```

## Persistence

On success, [`persistEmbeddings`](../../src/semantic/embedding/persistEmbeddings.ts):

1. Inserts rows into `message_embeddings` with `embedding_vector vector(1536)`
2. Calls `markMessageSemanticsEmbedded` to set status to `EMBEDDED`

Vectors are stored with an HNSW cosine index (`idx_message_embeddings_vector`) for similarity search.

## Error Handling

[`handleEmbeddingBatchError`](../../src/semantic/embedding/handleEmbeddingError.ts) classifies errors:

| Error type | HTTP status | Action |
|------------|-------------|--------|
| Transient | 429, 5xx | Requeue with exponential backoff |
| Permanent | 400, 401, 403 | Mark FAILED immediately |
| Max retries exceeded | — | Mark FAILED after 10 attempts |

Retry delay: `min(BASE_DELAY * 2^retryCount, MAX_DELAY_RETRY_MS)`

## HTTP Endpoints

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /api/public/internal/run-embedding-worker` | `x-embedding-worker-secret` header | Production cron target |
| `POST /api/run-embedding-worker` | Dev-only (404 in prod) | Manual local testing |
| `POST /api/generate-embeddings` | None (JSON schema only) | Direct OpenAI proxy |

See [API Routes](../api/readme.md) and [Cron & Background Jobs](../cron/readme.md).

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | OpenAI API authentication |
| `EMBEDDING_WORKER_SECRET` | Cron endpoint secret (timing-safe comparison) |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client for claim and persist |

## Related Docs

- [Pipeline](pipeline.md) — Full two-phase flow
- [Scoring](msg_scoring.md) — What determines QUEUED vs SKIPPED
- [Database Schema](../architecture/database.md) — message_embeddings table

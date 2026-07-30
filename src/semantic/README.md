# Semantic Module

The `src/semantic` module implements Tamarind's message intelligence pipeline. It normalizes chat messages, scores their semantic value, persists eligible content, and generates vector embeddings for future search.

This is a **server-only** module. It uses the Supabase admin client (lazy-loaded) and must not be imported from client-side code.

## Directory Structure

```
src/semantic/
├── enqueueMessageSemanticsProcessing.ts   # Entry: fire-and-forget trigger
├── checksum/computeMessageChecksum.ts     # SHA-256 dedup key
├── normalization/                           # Text cleanup pipeline
├── message-scoring/                         # Heuristic quality model
│   └── models/mvp-v1/                       # Current scoring model
├── persistence/                             # DB repositories
└── embedding/                               # Batch worker + OpenAI provider
    └── providers/openai/
```

There is no barrel `index.ts`. Import specific files directly.

## Public Exports

| File | Export | Role |
|------|--------|------|
| `enqueueMessageSemanticsProcessing.ts` | `enqueueMessageSemanticsProcessing` | Primary entry point (uses `waitUntil`) |
| `normalization/normalizer.ts` | `processMessageNormalization`, `processAndPersistMessageSemantics` | Sync pipeline steps |
| `normalization/normalizeMessage.ts` | `normalizeMessage` | Pure normalization |
| `message-scoring/buildScoringInput.ts` | `buildScoringInput` | DB-backed scoring input |
| `message-scoring/models/mvp-v1/scorer.ts` | `calculateScore` | Heuristic scorer |
| `message-scoring/models/mvp-v1/config.ts` | `SCORING_CONFIG` | Tunable scoring config |
| `persistence/persistMessageSemantics.ts` | `persistMessageSemantics` | Persist with dedup |
| `checksum/computeMessageChecksum.ts` | `computeMessageChecksum` | SHA-256 dedup key |
| `embedding/runEmbeddingWorker.ts` | `runEmbeddingWorker` | Worker entry |
| `embedding/embeddingProvider.ts` | `embeddingProvider` | Active provider instance |
| `embedding/providers/openai/embeddings.server.ts` | `generateEmbeddingsFromRaw` | Direct OpenAI API helper |

## Inbound Dependencies (Who Calls This Module)

| Consumer | Import |
|----------|--------|
| `src/lib/conversations.functions.ts` | `enqueueMessageSemanticsProcessing` (on message send) |
| `src/lib/pages.server.ts` | `enqueueMessageSemanticsProcessing` (page share announcement) |
| `src/routes/api/run-embedding-worker.ts` | `runEmbeddingWorker` (dev-only) |
| `src/routes/api/public/internal/run-embedding-worker.ts` | `runEmbeddingWorker` (cron) |
| `src/routes/api/generate-embeddings.ts` | `generateEmbeddingsFromRaw` |

## Outbound Dependencies

| Dependency | Usage |
|------------|-------|
| `@/lib/debugLogger` | Structured logging |
| `@/integrations/supabase/client.server` | `supabaseAdmin` (lazy dynamic import) |
| `cloudflare:workers` (`waitUntil`) | Background task scheduling |
| `node:crypto` | Checksum hashing |
| `zod` | Embedding request validation |
| `process.env.OPENAI_API_KEY` | OpenAI embeddings API |
| `process.env.EMBEDDING_WORKER_SECRET` | Cron endpoint auth |
| Supabase RPC `claim_embedding_batch` | Atomic batch claim |
| DB tables: `messages`, `message_semantics`, `message_embeddings` | Persistence |

## Data Flow

Two decoupled phases run independently:

### Phase A: Normalize → Score → Persist (inline, on message create)

```
Message inserted
  → enqueueMessageSemanticsProcessing (waitUntil)
  → normalizeMessage
  → buildScoringInput (prior 4 messages)
  → calculateScore
  → persistMessageSemantics (checksum dedup)
  → embedding_status = QUEUED | SKIPPED
```

### Phase B: Embed (async, cron-driven)

```
Cron POST /api/public/internal/run-embedding-worker
  → runEmbeddingWorker
  → claim_embedding_batch RPC
  → OpenAI text-embedding-3-small
  → persist to message_embeddings
  → embedding_status = EMBEDDED | FAILED
```

## Embedding Status Lifecycle

```
NEW → QUEUED → PROCESSING → EMBEDDED
                          → FAILED
                          → SKIPPED (set at persist time, never claimed)
```

## Environment Variables

| Variable | Required by |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI embedding provider |
| `EMBEDDING_WORKER_SECRET` | Cron endpoint authentication |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client for persistence |

## Documentation

Detailed breakdown in [`docs/semantic/`](../docs/semantic/readme.md):

- [Pipeline](../docs/semantic/pipeline.md)
- [Normalization](../docs/semantic/msg_normalization.md)
- [Scoring](../docs/semantic/msg_scoring.md)
- [Embedding](../docs/semantic/msg_embedding.md)

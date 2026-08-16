# Semantic Module

The `src/semantic` module implements Tamarind's message intelligence pipeline. It normalizes chat messages, scores their semantic value, persists eligible content, and generates vector embeddings for future search.

This is a **server-only** module. It uses the Supabase admin client (lazy-loaded) and must not be imported from client-side code.

## Directory Structure

```
src/semantic/
├── enqueueMessageSemanticsProcessing.ts   # Entry: fire-and-forget trigger
├── embedding/                               # Generic text embedding client
│   ├── types.ts
│   ├── embeddingProvider.ts
│   └── providers/openai/
├── llm/                                     # Generic LLM client
│   ├── types.ts
│   ├── llmProvider.ts
│   └── providers/openai/
├── conversation-topics/                     # CTI (worker + engine)
│   ├── types/                               # job + plan types
│   ├── errors.ts                            # CtiPermanentError, CtiTransientError
│   ├── worker/                              # durable job lifecycle
│   │   └── runCtiWorker.ts
│   └── engine/                              # planTransition core
│       ├── conversationTopicEngine.ts
│       ├── planTransition.ts
│       └── persistence/
└── messages/                                # Message indexing pipeline
    ├── message-checksum/
    ├── message-normalization/
    ├── message-scoring/models/mvp-v1/
    ├── message-persistence/
    └── message-embedding/
```

There is no barrel `index.ts`. Import specific files directly.

## Public Exports

| File | Export | Role |
|------|--------|------|
| `enqueueMessageSemanticsProcessing.ts` | `enqueueMessageSemanticsProcessing` | Primary entry point (uses `waitUntil`) |
| `messages/message-normalization/normalizer.ts` | `processMessageNormalization`, `processAndPersistMessageSemantics` | Sync pipeline steps |
| `messages/message-normalization/normalizeMessage.ts` | `normalizeMessage` | Pure normalization |
| `messages/message-scoring/buildScoringInput.ts` | `buildScoringInput` | DB-backed scoring input |
| `messages/message-scoring/models/mvp-v1/scorer.ts` | `calculateScore` | Heuristic scorer |
| `messages/message-scoring/models/mvp-v1/config.ts` | `SCORING_CONFIG` | Tunable scoring config |
| `messages/message-persistence/persistMessageSemantics.ts` | `persistMessageSemantics` | Persist with dedup |
| `messages/message-checksum/computeMessageChecksum.ts` | `computeMessageChecksum` | SHA-256 dedup key |
| `messages/message-embedding/runEmbeddingWorker.ts` | `runEmbeddingWorker` | Embedding worker entry |
| `conversation-topics/worker/runCtiWorker.ts` | `runCtiWorker` | CTI worker entry |
| `embedding/embeddingProvider.ts` | `embeddingProvider` | Generic embedding provider instance |
| `llm/llmProvider.ts` | `llmProvider` | Generic LLM provider instance |
| `embedding/providers/openai/embeddings.server.ts` | `embedBatchFromRaw` | Generic OpenAI embeddings helper |
| `messages/message-embedding/generateMessageEmbeddings.ts` | `generateMessageEmbeddingsFromRaw` | Message-shaped HTTP adapter |

## Inbound Dependencies (Who Calls This Module)

| Consumer | Import |
|----------|--------|
| `src/lib/conversations.functions.ts` | `enqueueMessageSemanticsProcessing` (on message send) |
| `src/lib/pages.server.ts` | `enqueueMessageSemanticsProcessing` (page share announcement) |
| `src/routes/api/run-embedding-worker.ts` | `runEmbeddingWorker` (dev-only) |
| `src/routes/api/public/internal/run-embedding-worker.ts` | `runEmbeddingWorker` (cron) |
| `src/routes/api/run-cti-worker.ts` | `runCtiWorker` (dev-only) |
| `src/routes/api/public/internal/run-cti-worker.ts` | `runCtiWorker` (cron) |
| `src/routes/api/generate-embeddings.ts` | `generateMessageEmbeddingsFromRaw` |

## Outbound Dependencies

| Dependency | Usage |
|------------|-------|
| `@/lib/debugLogger` | Structured logging |
| `@/integrations/supabase/client.server` | `supabaseAdmin` (lazy dynamic import) |
| `cloudflare:workers` (`waitUntil`) | Background task scheduling |
| `node:crypto` | Checksum hashing |
| `zod` | Embedding and LLM request validation |
| `process.env.OPENAI_API_KEY` | OpenAI embeddings and LLM APIs |
| `process.env.EMBEDDING_WORKER_SECRET` | Embedding cron endpoint auth |
| `process.env.CTI_WORKER_SECRET` | CTI cron endpoint auth |
| Supabase RPC `claim_embedding_batch` | Atomic batch claim |
| Supabase RPC `claim_conversation_topic_job` | Atomic single CTI job claim |
| Supabase RPC `match_conversation_topics` | Message-to-topic cosine similarities |
| Supabase RPC `apply_cti_plan_and_commit` | Apply topic plan + complete job |
| Supabase RPC `finalize_embedded_message` | EMBEDDED + CTI job enqueue |
| DB tables: `messages`, `message_semantics`, `message_embeddings`, `conversation_topic_jobs`, `conversation_topics`, `conversation_topic_evidences` | Persistence |

## Data Flow

Two decoupled phases run independently, followed by CTI:

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
  → embeddingProvider.embedBatch (generic)
  → map results to message_semantics IDs
  → persist to message_embeddings
  → finalize_embedded_message (EMBEDDED + CTI job QUEUED)
```

### Phase C: CTI (async, cron-driven)

```
Cron POST /api/public/internal/run-cti-worker
  → runCtiWorker
  → claim_conversation_topic_job RPC (one next-in-order job)
  → conversationTopicEngine.planTransition (similarity, LLM, embeddings)
  → apply_cti_plan_and_commit RPC (topic/evidence writes + COMPLETED)
  → COMPLETED | RETRY_WAIT | QUARANTINED
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
| `OPENAI_API_KEY` | OpenAI embedding and LLM providers |
| `EMBEDDING_WORKER_SECRET` | Embedding cron endpoint authentication |
| `CTI_WORKER_SECRET` | CTI cron endpoint authentication |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client for persistence |

## Documentation

Detailed breakdown in [`docs/semantic/`](../docs/semantic/readme.md):

- [Pipeline](../docs/semantic/pipeline.md)
- [Normalization](../docs/semantic/msg_normalization.md)
- [Scoring](../docs/semantic/msg_scoring.md)
- [Embedding](../docs/semantic/msg_embedding.md)

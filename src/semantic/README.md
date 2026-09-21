# Semantic Module

The `src/semantic` module implements Tamarind's message intelligence pipeline and page semantics. It normalizes chat messages, scores their semantic value, persists eligible content, and generates vector embeddings for search. Pages are structurally chunked on a debounce sweeper; a separate cron worker embeds queued `page_chunk_embeddings` rows and canonical `page_topic_embeddings`. Another cron worker produces an LLM topic name and description per page. A conversation-suggestion worker judges whether to nudge a participant toward a related message or page chunk.

This is a **server-only** module. It uses the Supabase admin client (lazy-loaded) and must not be imported from client-side code.

## Directory Structure

```
src/semantic/
├── enqueueMessageSemanticsProcessing.ts   # Entry: fire-and-forget trigger
├── embedding/                               # Generic text embedding client
│   ├── types.ts
│   ├── embeddingProvider.ts
│   ├── canonicalTopicText.ts              # shared `{name}: {description}` string
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
├── conversation-suggestions/                # suggestion worker + LLM judge
│   ├── types/
│   ├── errors.ts
│   ├── engine/                              # config, topic-focus, LLM prompt
│   ├── persistence/
│   └── worker/                              # runConversationSuggestionWorker
├── messages/                                # Message indexing pipeline
│   ├── message-checksum/
│   ├── message-normalization/
│   ├── message-scoring/models/mvp-v1/
│   ├── message-persistence/
│   └── message-embedding/
└── pages/                                   # Page chunking + embedding + LLM topics
    ├── page-chunks/
    │   ├── engine/                          # TipTap pack + token limits
    │   ├── persistence/                     # checksum reconcile
    │   └── worker/                          # runPageChunkingWorker
    ├── page-embeddings/
    │   ├── persistence/                     # chunk + topic claim, heartbeat, persist
    │   └── worker/                          # runPageEmbeddingWorker
    └── page-semantics/
        ├── engine/                          # config + LLM prompt/schema
        ├── persistence/                     # due list, enqueue, apply
        └── worker/                          # sweep + runPageSemanticWorker
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
| `embedding/canonicalTopicText.ts` | `canonicalTopicText` | Shared `{name}: {description}` embed string |
| `llm/llmProvider.ts` | `llmProvider` | Generic LLM provider instance |
| `pages/page-chunks/worker/runPageChunkingWorker.ts` | `runPageChunkingWorker` | Page chunking sweeper entry |
| `pages/page-chunks/engine/config.ts` | `PAGE_CHUNK_CONFIG` | Debounce, pack sizes, embedding model |
| `pages/page-embeddings/worker/runPageEmbeddingWorker.ts` | `runPageEmbeddingWorker` | Page embedding worker entry |
| `pages/page-semantics/worker/runPageSemanticWorker.ts` | `runPageSemanticWorker` | Page semantic worker entry |
| `conversation-suggestions/worker/runConversationSuggestionWorker.ts` | `runConversationSuggestionWorker` | Conversation suggestion worker entry |

## Inbound Dependencies (Who Calls This Module)

| Consumer | Import |
|----------|--------|
| `src/lib/conversations.functions.ts` | `enqueueMessageSemanticsProcessing` (on message send) |
| `src/lib/pages.server.ts` | `enqueueMessageSemanticsProcessing` (page share announcement) |
| `src/routes/api/run-embedding-worker.ts` | `runEmbeddingWorker` (dev-only) |
| `src/routes/api/public/internal/run-embedding-worker.ts` | `runEmbeddingWorker` (cron) |
| `src/routes/api/run-cti-worker.ts` | `runCtiWorker` (dev-only) |
| `src/routes/api/public/internal/run-cti-worker.ts` | `runCtiWorker` (cron) |
| `src/routes/api/run-page-chunking-worker.ts` | `runPageChunkingWorker` (dev-only) |
| `src/routes/api/public/internal/run-page-chunking-worker.ts` | `runPageChunkingWorker` (cron) |
| `src/routes/api/run-page-embedding-worker.ts` | `runPageEmbeddingWorker` (dev-only) |
| `src/routes/api/public/internal/run-page-embedding-worker.ts` | `runPageEmbeddingWorker` (cron) |
| `src/routes/api/run-page-semantic-worker.ts` | `runPageSemanticWorker` (dev-only) |
| `src/routes/api/public/internal/run-page-semantic-worker.ts` | `runPageSemanticWorker` (cron) |
| `src/routes/api/run-conversation-suggestion-worker.ts` | `runConversationSuggestionWorker` (dev-only) |
| `src/routes/api/public/internal/run-conversation-suggestion-worker.ts` | `runConversationSuggestionWorker` (cron) |

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
| `process.env.PAGE_CHUNKING_WORKER_SECRET` | Page chunking cron endpoint auth |
| `process.env.PAGE_EMBEDDING_WORKER_SECRET` | Page embedding cron endpoint auth |
| `process.env.PAGE_SEMANTIC_WORKER_SECRET` | Page semantic cron endpoint auth |
| `process.env.CONVERSATION_SUGGESTIONS_WORKER_SECRET` | Conversation suggestion cron endpoint auth |
| `gpt-tokenizer` | cl100k_base token counts for page chunks and snapshot diffs |
| Supabase RPC `claim_embedding_batch` | Atomic batch claim |
| Supabase RPC `claim_conversation_topic_job` | Atomic single CTI job claim |
| Supabase RPC `match_conversation_topics` | Message-to-topic cosine similarities |
| Supabase RPC `apply_cti_plan_and_commit` | Apply topic plan + complete job |
| Supabase RPC `finalize_embedded_message` | EMBEDDED + CTI job enqueue |
| Supabase RPC `list_pages_due_for_chunking` | Pages idle past debounce that need chunking |
| Supabase RPC `claim_page_chunk_embedding_batch` | Atomic page-chunk-embedding batch claim |
| Supabase RPC `claim_page_topic_embedding_batch` | Atomic page-topic-embedding batch claim |
| Supabase RPC `list_pages_due_for_topics` | Pages idle past debounce that need LLM analysis |
| Supabase RPC `claim_page_topic_job` | Atomic page-semantic job claim |
| Supabase RPC `enqueue_page_topic_job` | Upsert in-flight analysis job |
| Supabase RPC `apply_page_topic_result` | Upsert page_topics + complete job |
| Supabase RPC `list_conversation_suggestion_jobs_due` | Participant×conversation pairs due for a suggestion pass |
| Supabase RPC `enqueue_conversation_suggestion_job` | Upsert in-flight suggestion job |
| Supabase RPC `claim_conversation_suggestion_job` | Atomic suggestion job claim |
| Supabase RPC `apply_conversation_suggestion_result` | Insert suggestion or complete with none |
| Supabase RPC `search_messages_semantic_for_user` | ACL-aware message ANN for a workspace user |
| Supabase RPC `search_pages_semantic_for_user` | ACL-aware page-chunk ANN for a workspace user |
| DB tables: `messages`, `message_semantics`, `message_embeddings`, `conversation_topic_jobs`, `conversation_topics`, `conversation_topic_evidences`, `page_chunks`, `page_chunk_embeddings`, `page_topics`, `page_topic_jobs`, `page_topic_embeddings`, `conversation_suggestions`, `conversation_suggestion_jobs` | Persistence |

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

### Page chunking (async, cron-driven)

```
Page content save (last_modified_at)
  → Cron POST /api/public/internal/run-page-chunking-worker
  → runPageChunkingWorker
  → list_pages_due_for_chunking RPC (idle ≥ 5 minutes)
  → structural TipTap chunk + SHA-256 checksum
  → reconcile page_chunks (keep ids on checksum match)
  → page_chunk_embeddings.embedding_status = QUEUED (new/changed chunks only)
```

No OpenAI call in this phase.

### Page embedding (async, cron-driven)

```
Cron POST /api/public/internal/run-page-embedding-worker
  → runPageEmbeddingWorker
  → claim_page_topic_embedding_batch RPC (one batch)
  → load page_topics + canonicalTopicText checksum guard
  → embeddingProvider.embedBatch
  → guarded persist → EMBEDDED
  → claim_page_chunk_embedding_batch RPC
  → load page_chunks text + checksum guard
  → embeddingProvider.embedBatch (row.embedding_model)
  → guarded persist → EMBEDDED
  → RETRY_WAIT / FAILED on error (24h cooldown after 5 transient backoffs)
```

### Page semantics (async, cron-driven)

```
Page content save (last_modified_at)
  → Cron POST /api/public/internal/run-page-semantic-worker
  → runPageSemanticWorker
  → list_pages_due_for_topics (idle ≥ 5 minutes)
  → token-diff gate (≥ 300) or first analysis → enqueue_page_topic_job
  → claim_page_topic_job
  → live SHA-256 vs job hash (drift → COMPLETED, no write)
  → llmProvider.complete (gpt-5.4-nano)
  → apply_page_topic_result (page_topics upsert + COMPLETED)
  → trigger enqueue page_topic_embeddings QUEUED when topic fields change
  → RETRY_WAIT / FAILED on error (24h cooldown after 5 transient backoffs)
```

### Conversation suggestions (async, cron-driven)

```
Cron POST /api/public/internal/run-conversation-suggestion-worker
  → runConversationSuggestionWorker
  → list_conversation_suggestion_jobs_due (p_idle + p_cooldown from TS config)
  → enqueue_conversation_suggestion_job
  → claim_conversation_suggestion_job
  → recency / cooldown / topic-score / focus gates
  → search_*_semantic_for_user (winner topic embedding)
  → llmProvider.complete (gpt-5.4-nano judge)
  → apply_conversation_suggestion_result (PENDING row or committed_none)
  → RETRY_WAIT / FAILED on error (24h cooldown after 5 transient backoffs)
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

`historical_weight` is a monotonic DB accumulator: candidate evidence adds cosine similarity; first-time promotion and merge add the LLM confidence; established reinforces add similarity (T1) or confidence (T2). Recency decay is scoring-only.

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
| `PAGE_CHUNKING_WORKER_SECRET` | Page chunking cron endpoint authentication |
| `PAGE_EMBEDDING_WORKER_SECRET` | Page embedding cron endpoint authentication |
| `PAGE_SEMANTIC_WORKER_SECRET` | Page semantic cron endpoint authentication |
| `CONVERSATION_SUGGESTIONS_WORKER_SECRET` | Conversation suggestion cron endpoint authentication |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client for persistence |

## Documentation

Detailed breakdown in [`docs/semantic/`](../docs/semantic/readme.md):

- [Pipeline](../docs/semantic/pipeline.md)
- [Normalization](../docs/semantic/msg_normalization.md)
- [Scoring](../docs/semantic/msg_scoring.md)
- [Embedding](../docs/semantic/msg_embedding.md)
- [Page Embedding](../docs/semantic/page_embedding.md)
- [Page Semantics](../docs/semantic/page_semantic.md)
- [Conversation Topics](../docs/semantic/conversation_topics.md)
- [Conversation Suggestions](../docs/semantic/conversation_suggestions.md)

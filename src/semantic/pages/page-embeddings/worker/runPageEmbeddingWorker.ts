import { DebugLogger } from "@/lib/debugLogger";

import { embeddingProvider } from "@/semantic/embedding/embeddingProvider";
import { isEmbedSuccess } from "@/semantic/embedding/types";

import {
  claimPageEmbeddingBatch,
  loadChunksByIds,
  markPageEmbeddingFailed,
  persistPageEmbedding,
  releasePageEmbedding,
  requeuePageEmbedding,
  touchPageEmbeddings,
  type PageEmbeddingRow,
} from "../persistence/pageEmbeddingsRepository";
import { PAGE_EMBEDDING_CONFIG } from "./config";
import {
  getCooldownUntil,
  getNextRetryAt,
  hasExceededTransientBackoffs,
  isTransientEmbeddingError,
} from "./retry";

const LOG_SCOPE = "page-embedding-worker";

export type RunPageEmbeddingWorkerResult = {
  batchesProcessed: number;
  claimed: number;
  embedded: number;
  skipped: number;
  failed: number;
};

type BatchOutcome = {
  claimed: number;
  embedded: number;
  skipped: number;
  failed: number;
};

async function handleBatchError(
  rows: PageEmbeddingRow[],
  status: number,
  message: string,
): Promise<void> {
  const summary = `${status}: ${message}`;

  for (const row of rows) {
    if (!isTransientEmbeddingError(status)) {
      await markPageEmbeddingFailed(row.id, summary);
      continue;
    }

    const attempts = row.attempts + 1;
    if (hasExceededTransientBackoffs(attempts)) {
      // CTI pattern: long cooldown on RETRY_WAIT with attempts reset — never FAILED.
      await requeuePageEmbedding({
        id: row.id,
        attempts: 0,
        nextRetryAt: getCooldownUntil(),
        lastError: `${summary} (transient budget exhausted; 24h cooldown)`,
      });
      continue;
    }

    await requeuePageEmbedding({
      id: row.id,
      attempts,
      nextRetryAt: getNextRetryAt(attempts),
      lastError: summary,
    });
  }

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "BATCH_ERROR",
    message: `${rows.length} rows · ${summary}`,
    level: "error",
  });
}

async function processClaimedBatch(): Promise<BatchOutcome> {
  const claimedRows = await claimPageEmbeddingBatch();
  const outcome: BatchOutcome = {
    claimed: claimedRows.length,
    embedded: 0,
    skipped: 0,
    failed: 0,
  };
  if (claimedRows.length === 0) return outcome;

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "BATCH_CLAIMED",
    message: `${claimedRows.length} rows`,
  });

  const chunks = await loadChunksByIds(claimedRows.map((row) => row.chunk_id));

  const embeddable: Array<{ row: PageEmbeddingRow; content: string }> = [];

  for (const row of claimedRows) {
    const chunk = chunks.get(row.chunk_id);

    if (!chunk) {
      // Chunk removed by reconciliation; CASCADE already dropped (or will drop) the row.
      outcome.skipped += 1;
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "CHUNK_MISSING",
        message: `${row.id} · chunk ${row.chunk_id}`,
        level: "warn",
      });
      continue;
    }

    if (chunk.checksum !== row.checksum) {
      outcome.skipped += 1;
      await releasePageEmbedding(row.id, chunk.checksum);
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "CHECKSUM_DRIFT",
        message: `${row.id} · requeued with live checksum`,
        level: "warn",
      });
      continue;
    }

    embeddable.push({ row, content: chunk.content });
  }

  if (embeddable.length === 0) return outcome;

  // Heartbeat before the long call so stale recovery does not double-embed.
  await touchPageEmbeddings(embeddable.map((item) => item.row.id));

  const timer = DebugLogger.time("generate-page-embedding", "EMBEDDING_TIME");
  const result = await embeddingProvider.embedBatch({
    model: PAGE_EMBEDDING_CONFIG.PAGE_EMBEDDING_MODEL,
    texts: embeddable.map((item) => item.content),
  });
  timer.end();

  if (!isEmbedSuccess(result)) {
    const message = "error" in result.body ? result.body.error : "Unknown embedding error";
    await handleBatchError(
      embeddable.map((item) => item.row),
      result.status,
      message,
    );
    outcome.failed += embeddable.length;
    return outcome;
  }

  const { embeddings, model } = result.body;

  for (let index = 0; index < embeddable.length; index += 1) {
    const item = embeddable[index]!;
    const vector = embeddings[index];
    if (!vector) {
      outcome.failed += 1;
      await markPageEmbeddingFailed(item.row.id, "Provider returned no vector for this text");
      continue;
    }

    const persisted = await persistPageEmbedding({
      id: item.row.id,
      checksum: item.row.checksum,
      embedding: vector.embedding,
      model,
    });

    if (persisted) {
      outcome.embedded += 1;
    } else {
      outcome.skipped += 1;
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "PERSIST_SKIPPED",
        message: `${item.row.id} · row drifted during embed`,
        level: "warn",
      });
    }
  }

  return outcome;
}

export async function runPageEmbeddingWorker(): Promise<RunPageEmbeddingWorkerResult> {
  const result: RunPageEmbeddingWorkerResult = {
    batchesProcessed: 0,
    claimed: 0,
    embedded: 0,
    skipped: 0,
    failed: 0,
  };

  while (result.batchesProcessed < PAGE_EMBEDDING_CONFIG.MAX_BATCHES_PER_TICK) {
    const outcome = await processClaimedBatch();
    if (outcome.claimed === 0) break;

    result.batchesProcessed += 1;
    result.claimed += outcome.claimed;
    result.embedded += outcome.embedded;
    result.skipped += outcome.skipped;
    result.failed += outcome.failed;

    if (outcome.claimed < PAGE_EMBEDDING_CONFIG.PAGE_EMBEDDING_BATCH_SIZE) break;
  }

  if (result.batchesProcessed > 0) {
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "WORKER_TICK_COMPLETE",
      message: `${result.embedded} embedded · ${result.skipped} skipped · ${result.failed} failed`,
    });
  }

  return result;
}

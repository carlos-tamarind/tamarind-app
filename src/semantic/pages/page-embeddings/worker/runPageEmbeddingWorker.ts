import { DebugLogger } from "@/lib/debugLogger";

import { canonicalTopicText } from "@/semantic/embedding/canonicalTopicText";
import { embeddingProvider } from "@/semantic/embedding/embeddingProvider";
import { isEmbedSuccess } from "@/semantic/embedding/types";
import { computeMessageChecksum } from "@/semantic/messages/message-checksum/computeMessageChecksum";

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
import {
  claimPageTopicEmbeddingBatch,
  loadPageTopicsByIds,
  markPageTopicEmbeddingFailed,
  persistPageTopicEmbedding,
  releasePageTopicEmbedding,
  requeuePageTopicEmbedding,
  touchPageTopicEmbeddings,
  type PageTopicEmbeddingRow,
} from "../persistence/pageTopicEmbeddingsRepository";
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
  topicClaimed: number;
  topicEmbedded: number;
  topicSkipped: number;
  topicFailed: number;
};

type BatchOutcome = {
  claimed: number;
  embedded: number;
  skipped: number;
  failed: number;
  circuitBreak: boolean;
};

async function handleChunkBatchError(
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

async function handleTopicBatchError(
  rows: PageTopicEmbeddingRow[],
  status: number,
  message: string,
): Promise<void> {
  const summary = `${status}: ${message}`;

  for (const row of rows) {
    if (!isTransientEmbeddingError(status)) {
      await markPageTopicEmbeddingFailed(row.id, summary);
      continue;
    }

    const attempts = row.attempts + 1;
    if (hasExceededTransientBackoffs(attempts)) {
      await requeuePageTopicEmbedding({
        id: row.id,
        attempts: 0,
        nextRetryAt: getCooldownUntil(),
        lastError: `${summary} (transient budget exhausted; 24h cooldown)`,
      });
      continue;
    }

    await requeuePageTopicEmbedding({
      id: row.id,
      attempts,
      nextRetryAt: getNextRetryAt(attempts),
      lastError: summary,
    });
  }

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "TOPIC_BATCH_ERROR",
    message: `${rows.length} rows · ${summary}`,
    level: "error",
  });
}

async function processClaimedTopicBatch(): Promise<BatchOutcome> {
  const claimedRows = await claimPageTopicEmbeddingBatch();
  const outcome: BatchOutcome = {
    claimed: claimedRows.length,
    embedded: 0,
    skipped: 0,
    failed: 0,
    circuitBreak: false,
  };
  if (claimedRows.length === 0) return outcome;

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "TOPIC_BATCH_CLAIMED",
    message: `${claimedRows.length} rows`,
  });

  const topics = await loadPageTopicsByIds(claimedRows.map((row) => row.page_topic_id));
  const embeddable: Array<{ row: PageTopicEmbeddingRow; content: string }> = [];

  for (const row of claimedRows) {
    const topic = topics.get(row.page_topic_id);

    if (!topic) {
      outcome.skipped += 1;
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "TOPIC_ROW_MISSING",
        message: `${row.id} · page topic ${row.page_topic_id}`,
        level: "warn",
      });
      continue;
    }

    const content = canonicalTopicText(topic.topic_name, topic.topic_description);
    const liveChecksum = computeMessageChecksum(content);

    if (liveChecksum !== row.checksum) {
      outcome.skipped += 1;
      await releasePageTopicEmbedding(row.id, liveChecksum);
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "TOPIC_CHECKSUM_DRIFT",
        message: `${row.id} · requeued with live checksum`,
        level: "warn",
      });
      continue;
    }

    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "TOPIC_CANONICAL",
      message: `${row.page_topic_id} · ${row.checksum}`,
    });
    embeddable.push({ row, content });
  }

  if (embeddable.length === 0) return outcome;

  const byModel = new Map<string, Array<{ row: PageTopicEmbeddingRow; content: string }>>();
  for (const item of embeddable) {
    const model = item.row.embedding_model;
    const group = byModel.get(model);
    if (group) group.push(item);
    else byModel.set(model, [item]);
  }

  for (const [model, items] of byModel) {
    await touchPageTopicEmbeddings(items.map((item) => item.row.id));

    const timer = DebugLogger.time(LOG_SCOPE, "TOPIC_EMBEDDING_TIME");
    const result = await embeddingProvider.embedBatch({
      model,
      texts: items.map((item) => item.content),
    });
    timer.end();

    if (!isEmbedSuccess(result)) {
      const message = "error" in result.body ? result.body.error : "Unknown embedding error";
      await handleTopicBatchError(
        items.map((item) => item.row),
        result.status,
        message,
      );
      outcome.failed += items.length;
      if (isTransientEmbeddingError(result.status)) {
        outcome.circuitBreak = true;
      }
      return outcome;
    }

    const { embeddings } = result.body;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!;
      const vector = embeddings[index];
      if (!vector) {
        outcome.failed += 1;
        await markPageTopicEmbeddingFailed(
          item.row.id,
          "Provider returned no vector for this text",
        );
        continue;
      }

      const persisted = await persistPageTopicEmbedding({
        id: item.row.id,
        checksum: item.row.checksum,
        embedding: vector.embedding,
      });

      if (persisted) {
        outcome.embedded += 1;
      } else {
        outcome.skipped += 1;
        DebugLogger.log({
          scope: LOG_SCOPE,
          event: "TOPIC_PERSIST_SKIPPED",
          message: `${item.row.id} · row drifted during embed`,
          level: "warn",
        });
      }
    }
  }

  return outcome;
}

async function processClaimedChunkBatch(): Promise<BatchOutcome> {
  const claimedRows = await claimPageEmbeddingBatch();
  const outcome: BatchOutcome = {
    claimed: claimedRows.length,
    embedded: 0,
    skipped: 0,
    failed: 0,
    circuitBreak: false,
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

  const byModel = new Map<string, Array<{ row: PageEmbeddingRow; content: string }>>();
  for (const item of embeddable) {
    const model = item.row.embedding_model;
    const group = byModel.get(model);
    if (group) group.push(item);
    else byModel.set(model, [item]);
  }

  for (const [model, items] of byModel) {
    await touchPageEmbeddings(items.map((item) => item.row.id));

    const timer = DebugLogger.time("generate-page-embedding", "EMBEDDING_TIME");
    const result = await embeddingProvider.embedBatch({
      model,
      texts: items.map((item) => item.content),
    });
    timer.end();

    if (!isEmbedSuccess(result)) {
      const message = "error" in result.body ? result.body.error : "Unknown embedding error";
      await handleChunkBatchError(
        items.map((item) => item.row),
        result.status,
        message,
      );
      outcome.failed += items.length;
      if (isTransientEmbeddingError(result.status)) {
        outcome.circuitBreak = true;
      }
      return outcome;
    }

    const { embeddings } = result.body;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!;
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
  }

  return outcome;
}

function tickCompleteMessage(result: RunPageEmbeddingWorkerResult): string {
  return (
    `${result.embedded} embedded · ${result.skipped} skipped · ${result.failed} failed` +
    ` · topics ${result.topicEmbedded} embedded · ${result.topicSkipped} skipped · ${result.topicFailed} failed`
  );
}

export async function runPageEmbeddingWorker(): Promise<RunPageEmbeddingWorkerResult> {
  const result: RunPageEmbeddingWorkerResult = {
    batchesProcessed: 0,
    claimed: 0,
    embedded: 0,
    skipped: 0,
    failed: 0,
    topicClaimed: 0,
    topicEmbedded: 0,
    topicSkipped: 0,
    topicFailed: 0,
  };

  const topicOutcome = await processClaimedTopicBatch();
  result.topicClaimed = topicOutcome.claimed;
  result.topicEmbedded = topicOutcome.embedded;
  result.topicSkipped = topicOutcome.skipped;
  result.topicFailed = topicOutcome.failed;

  if (topicOutcome.circuitBreak) {
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "TICK_CIRCUIT_BREAK",
      message: "transient topic embedding error; stopping tick early",
      level: "warn",
    });
    if (topicOutcome.claimed > 0) {
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "WORKER_TICK_COMPLETE",
        message: tickCompleteMessage(result),
      });
    }
    return result;
  }

  while (result.batchesProcessed < PAGE_EMBEDDING_CONFIG.MAX_BATCHES_PER_TICK) {
    const outcome = await processClaimedChunkBatch();
    if (outcome.claimed === 0) break;

    result.batchesProcessed += 1;
    result.claimed += outcome.claimed;
    result.embedded += outcome.embedded;
    result.skipped += outcome.skipped;
    result.failed += outcome.failed;

    if (outcome.circuitBreak) {
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "TICK_CIRCUIT_BREAK",
        message: "transient embedding error; stopping tick early",
        level: "warn",
      });
      break;
    }

    if (outcome.claimed < PAGE_EMBEDDING_CONFIG.PAGE_EMBEDDING_BATCH_SIZE) break;
  }

  if (result.batchesProcessed > 0 || result.topicClaimed > 0) {
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "WORKER_TICK_COMPLETE",
      message: tickCompleteMessage(result),
    });
  }

  return result;
}

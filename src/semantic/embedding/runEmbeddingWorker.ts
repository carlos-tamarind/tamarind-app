import { DebugLogger } from "@/lib/debugLogger";

import { claimEmbeddingBatch } from "./claimBatch";
import { EMBEDDING_CONFIG } from "./config";
import { embeddingProvider } from "./embeddingProvider";
import { handleEmbeddingBatchError } from "./handleEmbeddingError";
import { persistEmbeddings } from "./persistEmbeddings";
import { isEmbeddingSuccess } from "./types";

const LOG_SCOPE = "embedding-worker";

async function processClaimedBatch(): Promise<number> {
  const batch = await claimEmbeddingBatch();
  if (batch.length === 0) return 0;

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "BATCH_CLAIMED",
    message: `${batch.length} messages`,
  });

  const timer = DebugLogger.time("generate-message-embedding", "EMBEDDING_TIME");

  const outcome = await embeddingProvider.generate({
    model: EMBEDDING_CONFIG.OPENAI_EMBEDDING_MODEL,
    messages: batch.map((row) => ({
      id: row.id,
      normalized_text: row.normalized_text,
    })),
  });

  timer.end();

  if (isEmbeddingSuccess(outcome)) {
    await persistEmbeddings(outcome.body);
    return batch.length;
  }

  const errorMessage = "error" in outcome.body ? outcome.body.error : "Unknown embedding error";

  await handleEmbeddingBatchError(batch, outcome.status, errorMessage);
  return batch.length;
}

export type RunEmbeddingWorkerResult = {
  batchesProcessed: number;
  messagesProcessed: number;
};

export async function runEmbeddingWorker(): Promise<RunEmbeddingWorkerResult> {
  let batchesProcessed = 0;
  let messagesProcessed = 0;

  while (batchesProcessed < EMBEDDING_CONFIG.MAX_BATCHES_PER_TICK) {
    const count = await processClaimedBatch();
    if (count === 0) break;

    batchesProcessed += 1;
    messagesProcessed += count;

    if (count < EMBEDDING_CONFIG.EMBEDDING_BATCH_SIZE) break;
  }

  if (batchesProcessed > 0) {
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "WORKER_TICK_COMPLETE",
      message: `${batchesProcessed} batches · ${messagesProcessed} messages`,
    });
  }

  return { batchesProcessed, messagesProcessed };
}

import { DebugLogger } from "@/lib/debugLogger";

import { embeddingProvider } from "@/semantic/embedding/embeddingProvider";
import { isEmbedSuccess } from "@/semantic/embedding/types";

import { claimEmbeddingBatch } from "./claimBatch";
import { EMBEDDING_CONFIG } from "./config";
import { handleEmbeddingBatchError } from "./handleEmbeddingError";
import { mapEmbeddingsToMessageResults } from "./mapMessageEmbeddings";
import { persistEmbeddings } from "./persistEmbeddings";

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

  const outcome = await embeddingProvider.embedBatch({
    model: EMBEDDING_CONFIG.OPENAI_EMBEDDING_MODEL,
    texts: batch.map((row) => row.normalized_text),
  });

  timer.end();

  if (isEmbedSuccess(outcome)) {
    const results = mapEmbeddingsToMessageResults(
      batch.map((row) => ({ id: row.id, normalized_text: row.normalized_text })),
      outcome.body.embeddings,
    );
    await persistEmbeddings({
      model: outcome.body.model,
      results,
      usage: outcome.body.usage,
    });
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

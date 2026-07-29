import { DebugLogger } from "@/lib/debugLogger";

import {
  markMessageSemanticsFailed,
  requeueMessageSemanticsForRetry,
} from "@/semantic/persistence/messageSemanticsRepository";
import type { MessageSemantics } from "@/semantic/persistence/types";

import {
  getNextRetryAt,
  hasExceededMaxRetries,
  isPermanentEmbeddingError,
  isTransientEmbeddingError,
} from "./retry";

const LOG_SCOPE = "embedding-worker";

function summarizeError(status: number, message: string): string {
  return `${status}: ${message.slice(0, 500)}`;
}

export async function handleEmbeddingBatchError(
  batch: MessageSemantics[],
  status: number,
  errorMessage: string,
): Promise<void> {
  const summary = summarizeError(status, errorMessage);

  for (const row of batch) {
    if (isPermanentEmbeddingError(status)) {
      await markMessageSemanticsFailed(row.id, summary);
      continue;
    }

    if (!isTransientEmbeddingError(status)) {
      await markMessageSemanticsFailed(row.id, summary);
      continue;
    }

    const nextRetryCount = row.retry_count + 1;
    if (hasExceededMaxRetries(nextRetryCount)) {
      await markMessageSemanticsFailed(row.id, `${summary} (max retries exceeded)`);
      continue;
    }

    await requeueMessageSemanticsForRetry(row.id, {
      retryCount: nextRetryCount,
      nextRetryAt: getNextRetryAt(nextRetryCount),
      lastError: summary,
    });
  }

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "EMBEDDING_BATCH_ERROR",
    message: `${batch.length} messages · ${summary}`,
    level: "error",
  });
}

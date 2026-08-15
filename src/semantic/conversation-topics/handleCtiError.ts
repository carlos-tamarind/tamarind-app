import { DebugLogger } from "@/lib/debugLogger";

import {
  markConversationTopicJobFailed,
  requeueConversationTopicJobForRetry,
} from "./conversationTopicJobsRepository";
import { getNextRetryAt, hasExceededMaxRetries } from "./retry";
import type { ConversationTopicJob } from "./types";

const LOG_SCOPE = "cti-worker";

function summarizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

export async function handleCtiJobError(
  job: ConversationTopicJob,
  error: unknown,
): Promise<void> {
  const summary = summarizeError(error);

  if (hasExceededMaxRetries(job.attempt_count)) {
    await markConversationTopicJobFailed(job.id, `${summary} (max retries exceeded)`);
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "JOB_FAILED",
      message: `${job.id} · ${summary}`,
      level: "error",
    });
    return;
  }

  await requeueConversationTopicJobForRetry(job.id, {
    nextRetryAt: getNextRetryAt(job.attempt_count),
    lastError: summary,
  });

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "JOB_REQUEUED",
    message: `${job.id} · attempt ${job.attempt_count} · ${summary}`,
    level: "error",
  });
}

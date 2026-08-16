import { DebugLogger } from "@/lib/debugLogger";

import { classifyCtiError } from "./classifyCtiError";
import {
  markConversationTopicJobQuarantined,
  markConversationTopicJobRetryWait,
} from "./conversationTopicJobsRepository";
import {
  getConversationHaltUntil,
  getNextRetryAt,
  hasExceededTransientBackoffs,
} from "./retry";
import type { ConversationTopicJob } from "./types";

const LOG_SCOPE = "cti-worker";

export type HandleCtiJobErrorResult =
  | { kind: "permanent" }
  | { kind: "transient"; globalInfra: boolean }
  | { kind: "halted" };

export async function handleCtiJobError(
  job: ConversationTopicJob,
  error: unknown,
): Promise<HandleCtiJobErrorResult> {
  const classification = classifyCtiError(error);

  if (classification.kind === "permanent") {
    await markConversationTopicJobQuarantined(job.id, classification.summary);
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "JOB_QUARANTINED",
      message: `${job.id} · permanent · ${classification.summary}`,
      level: "error",
    });
    return { kind: "permanent" };
  }

  if (hasExceededTransientBackoffs(job.attempt_count)) {
    const haltUntil = getConversationHaltUntil();
    await markConversationTopicJobRetryWait(job.id, {
      nextRetryAt: haltUntil,
      lastError: `${classification.summary} (conversation halted 24h after ${job.attempt_count} attempts)`,
      attemptCount: 0,
    });
    DebugLogger.table({
      scope: LOG_SCOPE,
      event: "CONVERSATION_HALTED",
      data: {
        jobId: job.id,
        conversationId: job.conversation_id,
        kind: "transient",
        attemptCount: job.attempt_count,
        haltUntil: haltUntil.toISOString(),
        error: classification.summary,
      },
    });
    return { kind: "halted" };
  }

  const nextRetryAt = getNextRetryAt(job.attempt_count);
  await markConversationTopicJobRetryWait(job.id, {
    nextRetryAt,
    lastError: classification.summary,
  });

  DebugLogger.table({
    scope: LOG_SCOPE,
    event: "JOB_RETRY_WAIT",
    data: {
      jobId: job.id,
      conversationId: job.conversation_id,
      kind: "transient",
      attemptCount: job.attempt_count,
      nextRetryAt: nextRetryAt.toISOString(),
      error: classification.summary,
    },
  });

  return { kind: "transient", globalInfra: classification.globalInfra };
}

import { DebugLogger } from "@/lib/debugLogger";

import {
  markConversationSuggestionJobFailed,
  markConversationSuggestionJobRetryWait,
} from "../persistence/suggestionJobsRepository";
import type { ConversationSuggestionJob } from "../types/job";
import { classifyConversationSuggestionError } from "./classifyError";
import { getCooldownUntil, getNextRetryAt, hasExceededTransientBackoffs } from "./retry";

const LOG_SCOPE = "conversation-suggestion-worker";

export type HandleConversationSuggestionJobErrorResult =
  { kind: "permanent" } | { kind: "transient"; globalInfra: boolean } | { kind: "halted" };

export async function handleConversationSuggestionJobError(
  job: ConversationSuggestionJob,
  error: unknown,
): Promise<HandleConversationSuggestionJobErrorResult> {
  const classification = classifyConversationSuggestionError(error);

  if (classification.kind === "permanent") {
    await markConversationSuggestionJobFailed(job.id, classification.summary);
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "JOB_FAILED",
      message: `${job.id} · permanent · ${classification.summary}`,
      level: "error",
    });
    return { kind: "permanent" };
  }

  if (hasExceededTransientBackoffs(job.attempts)) {
    const haltUntil = getCooldownUntil();
    await markConversationSuggestionJobRetryWait(job.id, {
      nextRetryAt: haltUntil,
      lastError: `${classification.summary} (24h cooldown after ${job.attempts} attempts)`,
      attempts: 0,
    });
    DebugLogger.table({
      scope: LOG_SCOPE,
      event: "JOB_RETRY_WAIT",
      data: {
        jobId: job.id,
        conversationId: job.conversation_id,
        kind: "cooldown",
        attempts: job.attempts,
        haltUntil: haltUntil.toISOString(),
        error: classification.summary,
      },
    });
    return { kind: "halted" };
  }

  const nextRetryAt = getNextRetryAt(job.attempts);
  await markConversationSuggestionJobRetryWait(job.id, {
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
      attempts: job.attempts,
      nextRetryAt: nextRetryAt.toISOString(),
      error: classification.summary,
    },
  });

  return { kind: "transient", globalInfra: classification.globalInfra };
}

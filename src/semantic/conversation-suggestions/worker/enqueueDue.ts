import { DebugLogger } from "@/lib/debugLogger";

import {
  CONVERSATION_SUGGESTION_COOLDOWN_INTERVAL,
  CONVERSATION_SUGGESTION_ENGINE_CONFIG,
  CONVERSATION_SUGGESTION_IDLE_INTERVAL,
} from "../engine/config";
import {
  enqueueConversationSuggestionJob,
  listConversationSuggestionJobsDue,
} from "../persistence/suggestionJobsRepository";

const LOG_SCOPE = "conversation-suggestion";

export type EnqueueDueSuggestionJobsResult = {
  pairsDue: number;
  enqueued: number;
  requeued: number;
  skipped: number;
  errors: number;
};

export async function enqueueDueSuggestionJobs(): Promise<EnqueueDueSuggestionJobsResult> {
  const due = await listConversationSuggestionJobsDue(
    CONVERSATION_SUGGESTION_IDLE_INTERVAL,
    CONVERSATION_SUGGESTION_COOLDOWN_INTERVAL,
    CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_SWEEP_BATCH_SIZE,
  );

  const result: EnqueueDueSuggestionJobsResult = {
    pairsDue: due.length,
    enqueued: 0,
    requeued: 0,
    skipped: 0,
    errors: 0,
  };

  for (const pair of due) {
    try {
      const outcome = await enqueueConversationSuggestionJob(
        pair.conversation_id,
        pair.workspace_user_id,
      );
      if (outcome === "enqueued") result.enqueued += 1;
      else if (outcome === "requeued") result.requeued += 1;
      else result.skipped += 1;
      if (outcome !== "processing") {
        DebugLogger.log({
          scope: LOG_SCOPE,
          event: "JOB_ENQUEUED",
          message: `${pair.conversation_id} · ${pair.workspace_user_id} · ${outcome}`,
        });
      }
    } catch (error) {
      result.errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "SWEEP_PAIR_FAILED",
        message: `${pair.conversation_id} · ${message}`,
        level: "error",
      });
    }
  }

  return result;
}

import { DebugLogger } from "@/lib/debugLogger";

import { CONVERSATION_SUGGESTION_ENGINE_CONFIG } from "../engine/config";
import { interpretSuggestionLlm } from "../engine/llm/interpretSuggestionLlm";
import { buildConversationSuggestionPrompt } from "../engine/llm/prompts";
import { winnerTopicIsFocused, winnerTopicScore } from "../engine/topicFocus";
import {
  loadEntityType,
  loadSuggestionContext,
  searchSuggestionCandidates,
  wasEntitySuggestedRecently,
} from "../persistence/suggestionContextRepository";
import { applyConversationSuggestionResult } from "../persistence/suggestionJobsRepository";
import { claimConversationSuggestionJob } from "./claimJob";
import { CONVERSATION_SUGGESTION_WORKER_CONFIG } from "./config";
import { enqueueDueSuggestionJobs } from "./enqueueDue";
import { handleConversationSuggestionJobError } from "./handleError";

const LOG_SCOPE = "conversation-suggestion-worker";
const ALLOWED_ENTITY_TYPES = new Set(["message", "page_chunk"]);

export type RunConversationSuggestionWorkerResult = {
  enqueued: number;
  processed: number;
  suggested: number;
  failed: number;
};

type ProcessClaimedJobResult =
  | { kind: "empty" }
  | {
      kind: "processed";
      circuitBreak: boolean;
      suggested: number;
      failed: number;
    };

async function commitNone(jobId: string): Promise<void> {
  await applyConversationSuggestionResult({ jobId, entityId: null });
}

async function processClaimedJob(): Promise<ProcessClaimedJobResult> {
  const job = await claimConversationSuggestionJob();
  if (!job) return { kind: "empty" };

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "JOB_CLAIMED",
    message: `${job.id} · conversation ${job.conversation_id} · user ${job.workspace_user_id}`,
  });

  try {
    const context = await loadSuggestionContext({
      conversationId: job.conversation_id,
      workspaceUserId: job.workspace_user_id,
    });

    const now = Date.now();
    const lastEmbeddedAt = context?.lastEmbeddedAt?.getTime() ?? null;
    const tooOld =
      lastEmbeddedAt === null ||
      now - lastEmbeddedAt >
        CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_LAST_MSG_CONTEXT_WINDOW_MS;
    const tooFresh =
      lastEmbeddedAt !== null &&
      now - lastEmbeddedAt <
        CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_DEBOUNCE_MS;
    const inCooldown = Boolean(context?.lastNegativeFeedbackAt);
    const winner = context?.winner ?? null;
    const score = winner ? winnerTopicScore(winner) : 0;
    const focused =
      winner && context
        ? winnerTopicIsFocused({
            winnerId: winner.id,
            establishedTopics: context.establishedTopics,
            recentMessages: context.recentMessages,
          })
        : false;

    if (
      !context ||
      !winner ||
      tooOld ||
      tooFresh ||
      inCooldown ||
      context.hasUnexpiredPending ||
      score <
        CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_CURRENT_TOPIC_SCORE_THRESHOLD ||
      !focused
    ) {
      await commitNone(job.id);
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "GATE_ABORT",
        message: `${job.id} · tooOld=${tooOld} tooFresh=${tooFresh} cooldown=${inCooldown} pending=${context?.hasUnexpiredPending ?? false} score=${score.toFixed(3)} focused=${focused}`,
      });
      return { kind: "processed", circuitBreak: false, suggested: 0, failed: 0 };
    }

    const excludeMessageIds = new Set(context.recentMessages.map((message) => message.id));
    const candidates = await searchSuggestionCandidates({
      workspaceId: job.workspace_id,
      workspaceUserId: job.workspace_user_id,
      queryEmbedding: winner.embedding,
      excludeMessageIds,
    });

    if (candidates.length === 0) {
      await commitNone(job.id);
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "NO_CANDIDATES",
        message: job.id,
      });
      return { kind: "processed", circuitBreak: false, suggested: 0, failed: 0 };
    }

    const prompt = buildConversationSuggestionPrompt({
      topicName: winner.name,
      topicDescription: winner.description,
      recentMessages: context.recentMessages.map((message) => ({
        id: message.id,
        text: message.normalizedText,
      })),
      candidates,
    });
    const output = await interpretSuggestionLlm(prompt);

    const candidate = output.entity_id
      ? candidates.find((item) => item.entityId === output.entity_id)
      : undefined;
    const confOk =
      output.decision === "suggest" &&
      output.confidence >=
        CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_LLM_CONFIDENCE_THRESHOLD &&
      Boolean(candidate) &&
      Boolean(output.entity_id) &&
      Boolean(output.reason) &&
      Boolean(output.notification_text);

    if (!confOk || !candidate || !output.entity_id) {
      await commitNone(job.id);
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "LLM_REJECT",
        message: `${job.id} · decision=${output.decision} confidence=${output.confidence}`,
      });
      return { kind: "processed", circuitBreak: false, suggested: 0, failed: 0 };
    }

    const entityType = await loadEntityType(output.entity_id);
    if (!entityType || !ALLOWED_ENTITY_TYPES.has(entityType)) {
      await commitNone(job.id);
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "INVALID_ENTITY_TYPE",
        message: `${job.id} · ${output.entity_id} · ${entityType ?? "missing"}`,
        level: "warn",
      });
      return { kind: "processed", circuitBreak: false, suggested: 0, failed: 0 };
    }

    const recent = await wasEntitySuggestedRecently({
      conversationId: job.conversation_id,
      workspaceUserId: job.workspace_user_id,
      entityId: output.entity_id,
    });
    if (recent) {
      await commitNone(job.id);
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "ENTITY_BACKOFF",
        message: `${job.id} · ${output.entity_id}`,
      });
      return { kind: "processed", circuitBreak: false, suggested: 0, failed: 0 };
    }

    const expiresAt = new Date(
      Date.now() + CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_EXPIRATION_TIME_MS,
    ).toISOString();

    const applyResult = await applyConversationSuggestionResult({
      jobId: job.id,
      entityId: output.entity_id,
      conversationTopicId: winner.id,
      entitySimilarityScore: candidate.similarity,
      llmConfidence: output.confidence,
      reason: output.reason,
      notificationText: output.notification_text,
      expiresAt,
    });

    if (applyResult === "committed") {
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "JOB_COMPLETED",
        message: `${job.id} · ${output.entity_id}`,
      });
      return { kind: "processed", circuitBreak: false, suggested: 1, failed: 0 };
    }

    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "COMMIT_SKIPPED",
      message: `${job.id} · ${applyResult}`,
      level: "warn",
    });
    return { kind: "processed", circuitBreak: false, suggested: 0, failed: 0 };
  } catch (error) {
    const outcome = await handleConversationSuggestionJobError(job, error);
    const failed = outcome.kind === "permanent" ? 1 : 0;
    const circuitBreak = outcome.kind === "transient" && outcome.globalInfra;
    return { kind: "processed", circuitBreak, suggested: 0, failed };
  }
}

export async function runConversationSuggestionWorker(): Promise<RunConversationSuggestionWorkerResult> {
  const result: RunConversationSuggestionWorkerResult = {
    enqueued: 0,
    processed: 0,
    suggested: 0,
    failed: 0,
  };

  try {
    const sweep = await enqueueDueSuggestionJobs();
    result.enqueued = sweep.enqueued + sweep.requeued;
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "SWEEP_COMPLETE",
      message: `${sweep.pairsDue} due · ${result.enqueued} queued · ${sweep.errors} errors`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "SWEEP_FAILED",
      message,
      level: "error",
    });
  }

  while (result.processed < CONVERSATION_SUGGESTION_WORKER_CONFIG.MAX_JOBS_PER_TICK) {
    const outcome = await processClaimedJob();
    if (outcome.kind === "empty") break;

    result.processed += 1;
    result.suggested += outcome.suggested;
    result.failed += outcome.failed;

    if (outcome.circuitBreak) {
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "TICK_CIRCUIT_BREAK",
        message: "global infra transient error; stopping tick early",
        level: "warn",
      });
      break;
    }
  }

  if (result.processed > 0) {
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "WORKER_TICK_COMPLETE",
      message: `${result.enqueued} enqueued · ${result.processed} processed · ${result.suggested} suggested · ${result.failed} failed`,
    });
  }

  return result;
}

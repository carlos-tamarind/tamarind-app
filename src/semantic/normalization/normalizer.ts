import { DebugLogger } from "@/lib/debugLogger";
import { buildScoringInput } from "@/semantic/message-scoring/buildScoringInput";
import { calculateScore } from "@/semantic/message-scoring/models/mvp-v1/scorer";
import { persistMessageSemantics } from "@/semantic/persistence/persistMessageSemantics";

import { normalizeMessage } from "./normalizeMessage";
import type { NormalizationResult } from "./types";

export function processMessageNormalization(
  rawMessage: string,
  options?: { messageId?: string; messageType?: string },
): NormalizationResult {
  const result = normalizeMessage(rawMessage, options?.messageType);

  DebugLogger.table({
    scope: "message-normalization",
    event: result.shouldPersist ? "PERSIST" : "SKIP",
    data: {
      ...(options?.messageId ? { messageId: options.messageId } : {}),
      shouldPersist: result.shouldPersist,
      skipReason: result.skipReason ?? "—",
      rawMessage: result.rawMessage,
      normalizedText: result.normalizedText ?? "—",
    },
  });

  return result;
}

export async function processAndPersistMessageSemantics(
  rawMessage: string,
  options: { messageId: string; messageType?: string },
): Promise<void> {
  try {
    const result = processMessageNormalization(rawMessage, options);

    if (!result.shouldPersist || !result.normalizedText) {
      DebugLogger.table({
        scope: "message-semantics",
        event: "NOT_PERSISTED",
        data: {
          messageId: options.messageId,
          reason: result.skipReason ?? "not_eligible",
          shouldPersist: false,
        },
      });
      return;
    }

    const scoringInput = await buildScoringInput(options.messageId, result.normalizedText);

    if (!scoringInput) {
      DebugLogger.log({
        scope: "message-semantics",
        event: "backgroundError",
        message: `${options.messageId} · message not found for scoring context`,
        level: "error",
      });
      return;
    }

    const scoringResult = calculateScore(scoringInput.message, scoringInput.context);

    const persistResult = await persistMessageSemantics(options.messageId, result.normalizedText, {
      normalizedScore: scoringResult.normalizedScore,
      shouldEmbed: scoringResult.shouldEmbed,
    });

    DebugLogger.table({
      scope: "message-semantics",
      event: persistResult.persisted ? "INSERTED" : "NOT_PERSISTED",
      data: {
        messageId: options.messageId,
        reason: persistResult.persisted ? "—" : persistResult.reason,
        shouldPersist: true,
        ...(persistResult.persisted
          ? {
              normalizedScore: scoringResult.normalizedScore,
              qualityScore: persistResult.qualityScore,
              shouldEmbed: scoringResult.shouldEmbed,
              embeddingStatus: persistResult.embeddingStatus,
            }
          : {}),
      },
    });
  } catch (error) {
    DebugLogger.log({
      scope: "message-semantics",
      event: "backgroundError",
      message: `${options.messageId} · ${error instanceof Error ? error.message : String(error)}`,
      level: "error",
    });
  }
}

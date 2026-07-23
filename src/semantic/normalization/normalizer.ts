import { DebugLogger } from "@/lib/debugLogger";

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

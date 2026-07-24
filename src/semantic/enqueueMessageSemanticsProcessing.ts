import { waitUntil } from "cloudflare:workers";

import { DebugLogger } from "@/lib/debugLogger";

import { processAndPersistMessageSemantics } from "./normalization/normalizer";

export function enqueueMessageSemanticsProcessing(params: {
  messageId: string;
  rawMessage: string;
  messageType?: string;
}): void {
  const task = processAndPersistMessageSemantics(params.rawMessage, {
    messageId: params.messageId,
    messageType: params.messageType,
  }).catch((error) => {
    DebugLogger.log({
      scope: "message-semantics",
      event: "backgroundError",
      message: `${params.messageId} · ${error instanceof Error ? error.message : String(error)}`,
      level: "error",
    });
  });

  waitUntil(task);
}

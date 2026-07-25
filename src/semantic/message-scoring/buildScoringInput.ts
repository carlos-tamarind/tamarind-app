import { normalizeMessage } from "@/semantic/normalization/normalizeMessage";
import { findMessageWithPriorContext } from "@/semantic/persistence/messageRepository";

import type { NormalizedMessage, ScoringContext } from "./models/mvp-v1/types";

function toNormalizedMessage(
  record: {
    id: string;
    rawText: string;
    authorWorkspaceUserId: string | null;
  },
  normalized: string,
): NormalizedMessage {
  return {
    id: record.id,
    authorId: record.authorWorkspaceUserId,
    original: record.rawText,
    normalized,
  };
}

function normalizeForContext(rawText: string): string {
  return normalizeMessage(rawText).normalizedText ?? "";
}

export async function buildScoringInput(
  messageId: string,
  anchorNormalizedText: string,
): Promise<{ message: NormalizedMessage; context: ScoringContext } | null> {
  const loaded = await findMessageWithPriorContext(messageId);

  if (!loaded) return null;

  const message = toNormalizedMessage(loaded.anchor, anchorNormalizedText);
  const previousMessages = loaded.priorMessages.map((prior) =>
    toNormalizedMessage(prior, normalizeForContext(prior.rawText)),
  );

  return {
    message,
    context: { previousMessages },
  };
}

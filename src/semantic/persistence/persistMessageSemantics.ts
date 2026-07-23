import { computeMessageChecksum } from "@/semantic/checksum/computeMessageChecksum";

import {
  findMessageSemanticsByChecksum,
  findMessageSemanticsByMessageId,
  insertMessageSemantics,
} from "./messageSemanticsRepository";

export type PersistResult =
  | { persisted: true }
  | { persisted: false; reason: "duplicate_checksum" | "already_exists" | "skipped" };

export async function persistMessageSemantics(
  messageId: string,
  normalizedText: string,
): Promise<PersistResult> {
  const existing = await findMessageSemanticsByMessageId(messageId);
  if (existing) {
    return { persisted: false, reason: "already_exists" };
  }

  const checksum = computeMessageChecksum(normalizedText);

  const duplicate = await findMessageSemanticsByChecksum(checksum);
  if (duplicate) {
    return { persisted: false, reason: "duplicate_checksum" };
  }

  await insertMessageSemantics({
    message_id: messageId,
    normalized_text: normalizedText,
    checksum,
    language: "en",
    quality_score: 0.0,
    processable: true,
    embedding_status: "NEW",
  });

  return { persisted: true };
}

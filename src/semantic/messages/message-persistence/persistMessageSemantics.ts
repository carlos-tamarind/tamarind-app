import { computeMessageChecksum } from "@/semantic/messages/message-checksum/computeMessageChecksum";
import type { ScoringResult } from "@/semantic/messages/message-scoring/models/mvp-v1/types";

import {
  findMessageSemanticsByChecksum,
  findMessageSemanticsByMessageId,
  insertMessageSemantics,
} from "./messageSemanticsRepository";
import type { EmbeddingStatus } from "./types";

export type PersistResult =
  | { persisted: true; embeddingStatus: EmbeddingStatus; qualityScore: number }
  | { persisted: false; reason: "duplicate_checksum" | "already_exists" | "skipped" };

function roundQualityScore(normalizedScore: number): number {
  return Number(normalizedScore.toFixed(2));
}

export async function persistMessageSemantics(
  messageId: string,
  normalizedText: string,
  scoring: Pick<ScoringResult, "normalizedScore" | "shouldEmbed">,
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

  const qualityScore = roundQualityScore(scoring.normalizedScore);
  const embeddingStatus: EmbeddingStatus = scoring.shouldEmbed ? "QUEUED" : "SKIPPED";

  await insertMessageSemantics({
    message_id: messageId,
    normalized_text: normalizedText,
    checksum,
    language: "en",
    quality_score: qualityScore,
    processable: scoring.shouldEmbed,
    embedding_status: embeddingStatus,
  });

  return { persisted: true, embeddingStatus, qualityScore };
}

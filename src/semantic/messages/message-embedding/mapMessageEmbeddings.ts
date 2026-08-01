import type { TextEmbedding } from "@/semantic/embedding/types";

import type { MessageEmbeddingResult } from "./types";

export function mapEmbeddingsToMessageResults(
  messages: { id: string; normalized_text: string }[],
  embeddings: TextEmbedding[],
): MessageEmbeddingResult[] {
  return messages.map((message, index) => ({
    id: message.id,
    embedding: embeddings[index].embedding,
    dimensions: embeddings[index].dimensions,
  }));
}

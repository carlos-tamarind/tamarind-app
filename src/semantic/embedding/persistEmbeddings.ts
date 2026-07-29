import { DebugLogger } from "@/lib/debugLogger";

import {
  findActiveEmbeddingBySemanticId,
  formatEmbeddingVector,
  insertMessageEmbedding,
} from "@/semantic/persistence/messageEmbeddingsRepository";
import { markMessageSemanticsEmbedded } from "@/semantic/persistence/messageSemanticsRepository";

import type { EmbeddingSuccessResponse } from "./types";

const LOG_SCOPE = "embedding-worker";

export async function persistEmbeddings(response: EmbeddingSuccessResponse): Promise<void> {
  for (const result of response.results) {
    const existing = await findActiveEmbeddingBySemanticId(result.id, response.model);
    if (!existing) {
      await insertMessageEmbedding({
        message_semantics_id: result.id,
        model: response.model,
        dimensions: result.dimensions,
        embedding_vector: formatEmbeddingVector(result.embedding),
        is_active: true,
      });
    }

    await markMessageSemanticsEmbedded(result.id);
  }

  DebugLogger.table({
    scope: LOG_SCOPE,
    event: "EMBEDDINGS_PERSISTED",
    data: {
      count: response.results.length,
      model: response.model,
      promptTokens: response.usage.prompt_tokens,
      totalTokens: response.usage.total_tokens,
    },
  });
}

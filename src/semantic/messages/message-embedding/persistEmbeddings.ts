import { DebugLogger } from "@/lib/debugLogger";

import { formatEmbeddingVector } from "@/lib/vector/embeddingVectorUtil";
import {
  findActiveEmbeddingBySemanticId,
  insertMessageEmbedding,
} from "@/semantic/messages/message-persistence/messageEmbeddingsRepository";
import { finalizeEmbeddedMessage } from "@/semantic/messages/message-persistence/messageSemanticsRepository";

import type { MessageEmbeddingSuccessResponse } from "./types";

const LOG_SCOPE = "embedding-worker";

export async function persistEmbeddings(response: MessageEmbeddingSuccessResponse): Promise<void> {
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

    await finalizeEmbeddedMessage(result.id);
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

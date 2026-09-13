import { canonicalTopicText } from "@/semantic/embedding/canonicalTopicText";
import { embeddingProvider } from "@/semantic/embedding/embeddingProvider";
import { embed, isEmbedSuccess } from "@/semantic/embedding/types";

import { CanonicalTopicPermanentError, CanonicalTopicTransientError } from "../errors";
import { CANONICAL_TOPIC_ENGINE_CONFIG } from "./config";

export { canonicalTopicText };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function embedCanonicalTopic(name: string, description: string): Promise<number[]> {
  const text = canonicalTopicText(name, description);
  const timeoutMs = CANONICAL_TOPIC_ENGINE_CONFIG.CANONICAL_TOPIC_EMBEDDING_TIMEOUT_MS;

  const result = await Promise.race([
    embed(embeddingProvider, text),
    sleep(timeoutMs).then(() => "timeout" as const),
  ]);

  if (result === "timeout") {
    throw new CanonicalTopicTransientError(`topic embedding timed out after ${timeoutMs}ms`);
  }

  if (!isEmbedSuccess(result)) {
    const message = "error" in result.body ? result.body.error : "topic embedding failed";
    if (result.status === 408 || result.status === 429 || result.status >= 500) {
      throw new CanonicalTopicTransientError(`${result.status}: ${message}`, {
        globalInfra: result.status >= 500,
      });
    }
    throw new CanonicalTopicPermanentError(`${result.status}: ${message}`);
  }

  const vector = result.body.embeddings[0]?.embedding;
  if (!vector || vector.length === 0) {
    throw new CanonicalTopicPermanentError("topic embedding response was empty");
  }
  return vector;
}

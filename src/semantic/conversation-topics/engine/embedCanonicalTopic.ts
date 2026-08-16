import { embeddingProvider } from "@/semantic/embedding/embeddingProvider";
import { embed, isEmbedSuccess } from "@/semantic/embedding/types";

import { CtiPermanentError, CtiTransientError } from "../errors";
import { CTI_ENGINE_CONFIG } from "./config";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function canonicalTopicText(name: string, description: string): string {
  return `${name}: ${description}`;
}

export async function embedCanonicalTopic(
  name: string,
  description: string,
): Promise<number[]> {
  const text = canonicalTopicText(name, description);
  const timeoutMs = CTI_ENGINE_CONFIG.MAX_TOPIC_EMBEDDING_TIMEOUT_MS;

  const result = await Promise.race([
    embed(embeddingProvider, text),
    sleep(timeoutMs).then(() => "timeout" as const),
  ]);

  if (result === "timeout") {
    throw new CtiTransientError(`topic embedding timed out after ${timeoutMs}ms`);
  }

  if (!isEmbedSuccess(result)) {
    const message = "error" in result.body ? result.body.error : "topic embedding failed";
    if (result.status === 408 || result.status === 429 || result.status >= 500) {
      throw new CtiTransientError(`${result.status}: ${message}`, {
        globalInfra: result.status >= 500,
      });
    }
    throw new CtiPermanentError(`${result.status}: ${message}`);
  }

  const vector = result.body.embeddings[0]?.embedding;
  if (!vector || vector.length === 0) {
    throw new CtiPermanentError("topic embedding response was empty");
  }
  return vector;
}

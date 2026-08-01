import { DebugLogger } from "@/lib/debugLogger";

import { embeddingProvider } from "@/semantic/embedding/embeddingProvider";
import { isEmbedSuccess } from "@/semantic/embedding/types";

import { mapEmbeddingsToMessageResults } from "./mapMessageEmbeddings";
import {
  type MessageEmbeddingOutcome,
  messageEmbeddingRequestSchema,
} from "./types";

const LOG_SCOPE = "generate-message-embedding";

function failure(status: number, message: string): MessageEmbeddingOutcome {
  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "EMBEDDING_FAILURE",
    message: `${status}: ${message}`,
    level: "error",
  });
  return { status, body: { error: message } };
}

export async function generateMessageEmbeddingsFromRaw(
  rawBody: unknown,
): Promise<MessageEmbeddingOutcome> {
  const parsed = messageEmbeddingRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return failure(
      400,
      `Invalid request payload: ${parsed.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`,
    );
  }

  const { model, messages } = parsed.data;

  const outcome = await embeddingProvider.embedBatch({
    model: model ?? undefined,
    texts: messages.map((m) => m.normalized_text),
  });

  if (!isEmbedSuccess(outcome)) {
    const errorMessage = "error" in outcome.body ? outcome.body.error : "Unknown embedding error";
    return failure(outcome.status, errorMessage);
  }

  return {
    status: 200,
    body: {
      model: outcome.body.model,
      results: mapEmbeddingsToMessageResults(messages, outcome.body.embeddings),
      usage: outcome.body.usage,
    },
  };
}

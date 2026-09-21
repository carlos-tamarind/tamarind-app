import { DebugLogger } from "@/lib/debugLogger";

import type { EmbeddingProvider } from "../../types";
import type { EmbedOutcome } from "../../types";

import { mapOpenAiEmbeddingsToVectors } from "./mapper";
import {
  DEFAULT_EMBEDDING_MODEL,
  SUPPORTED_EMBEDDING_MODELS,
  type OpenAiEmbeddingsResponse,
} from "./types";

const LOG_SCOPE = "embedding";

function failure(status: number, message: string): EmbedOutcome {
  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "EMBEDDING_FAILURE",
    message: `${status}: ${message}`,
    level: "error",
  });
  return { status, body: { error: message } };
}

async function embedBatch(options: {
  model?: string;
  texts: string[];
}): Promise<EmbedOutcome> {
  const { model: requestedModel, texts } = options;

  const model = (requestedModel ?? DEFAULT_EMBEDDING_MODEL).trim();
  if (!(SUPPORTED_EMBEDDING_MODELS as readonly string[]).includes(model)) {
    return failure(
      400,
      `Unsupported embedding model "${model}". Supported models: ${SUPPORTED_EMBEDDING_MODELS.join(", ")}.`,
    );
  }

  const emptyIndex = texts.findIndex((text) => text.trim().length === 0);
  if (emptyIndex !== -1) {
    return failure(400, `texts[${emptyIndex}] is empty.`);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return failure(500, "OPENAI_API_KEY is not configured.");
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: texts,
      }),
    });
  } catch (error) {
    return failure(
      502,
      `Network error calling OpenAI Embeddings API: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let description = text;
    try {
      const json = JSON.parse(text) as { error?: { message?: string } };
      description = json.error?.message ?? text;
    } catch {
      /* keep raw text */
    }
    return failure(
      response.status,
      description || `OpenAI Embeddings API returned ${response.status}.`,
    );
  }

  let payload: OpenAiEmbeddingsResponse;
  try {
    payload = (await response.json()) as OpenAiEmbeddingsResponse;
  } catch (error) {
    return failure(
      502,
      `Could not parse OpenAI response: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const mapped = mapOpenAiEmbeddingsToVectors(texts.length, payload);
  if (!mapped.ok) {
    return failure(mapped.status, mapped.message);
  }

  DebugLogger.table({
    scope: LOG_SCOPE,
    event: "EMBEDDING_SUCCESSFUL",
    data: {
      totalTexts: texts.length,
      totalTokens: mapped.usage.prompt_tokens,
      model: payload.model ?? model,
    },
  });

  return {
    status: 200,
    body: {
      model: payload.model ?? model,
      embeddings: mapped.embeddings,
      usage: mapped.usage,
    },
  };
}

export const openAiEmbeddingProvider: EmbeddingProvider = {
  embedBatch,
};

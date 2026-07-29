import { DebugLogger } from "@/lib/debugLogger";

import type { EmbeddingProvider } from "../../types";
import type { EmbeddingOutcome, EmbeddingRequest } from "../../types";
import { embeddingRequestSchema } from "../../types";

import { mapOpenAiEmbeddingsToResults } from "./mapper";
import {
  DEFAULT_EMBEDDING_MODEL,
  SUPPORTED_EMBEDDING_MODELS,
  type OpenAiEmbeddingsResponse,
} from "./types";

const LOG_SCOPE = "generate-message-embedding";

function failure(status: number, message: string): EmbeddingOutcome {
  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "EMBEDDING_FAILURE",
    message: `${status}: ${message}`,
    level: "error",
  });
  return { status, body: { error: message } };
}

async function generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingOutcome> {
  const { model: requestedModel, messages } = request;

  const model = (requestedModel ?? DEFAULT_EMBEDDING_MODEL).trim();
  if (!(SUPPORTED_EMBEDDING_MODELS as readonly string[]).includes(model)) {
    return failure(
      400,
      `Unsupported embedding model "${model}". Supported models: ${SUPPORTED_EMBEDDING_MODELS.join(", ")}.`,
    );
  }

  const emptyIndex = messages.findIndex((m) => m.normalized_text.trim().length === 0);
  if (emptyIndex !== -1) {
    return failure(
      400,
      `normalized_text is empty for message "${messages[emptyIndex].id}" (index ${emptyIndex}).`,
    );
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
        input: messages.map((m) => m.normalized_text),
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

  const mapped = mapOpenAiEmbeddingsToResults(messages, payload);
  if (!mapped.ok) {
    return failure(mapped.status, mapped.message);
  }

  DebugLogger.table({
    scope: LOG_SCOPE,
    event: "EMBEDDING_SUCCESSFUL",
    data: {
      totalMessages: messages.length,
      totalTokens: mapped.usage.prompt_tokens,
      model: payload.model ?? model,
    },
  });

  return {
    status: 200,
    body: {
      model: payload.model ?? model,
      results: mapped.results,
      usage: mapped.usage,
    },
  };
}

/** Validates a raw HTTP body and delegates to the OpenAI provider. */
export async function generateEmbeddingsFromRaw(rawBody: unknown): Promise<EmbeddingOutcome> {
  const parsed = embeddingRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return failure(
      400,
      `Invalid request payload: ${parsed.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`,
    );
  }
  return generateEmbeddings(parsed.data);
}

export const openAiEmbeddingProvider: EmbeddingProvider = {
  generate: generateEmbeddings,
};

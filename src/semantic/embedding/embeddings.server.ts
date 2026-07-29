import { z } from "zod";

import { DebugLogger } from "@/lib/debugLogger";

const LOG_SCOPE = "generate-message-embedding";

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export const SUPPORTED_EMBEDDING_MODELS = [
  "text-embedding-3-small",
  "text-embedding-3-large",
] as const;

export type SupportedEmbeddingModel =
  (typeof SUPPORTED_EMBEDDING_MODELS)[number];

export const embeddingRequestSchema = z.object({
  model: z.string().nullish(),
  messages: z
    .array(
      z.object({
        id: z.string().min(1),
        normalized_text: z.string(),
      }),
    )
    .min(1),
});

export type EmbeddingRequest = z.infer<typeof embeddingRequestSchema>;

export type EmbeddingResult = {
  id: string;
  embedding: number[];
  dimensions: number;
};

export type EmbeddingSuccessResponse = {
  model: string;
  results: EmbeddingResult[];
  usage: { prompt_tokens: number; total_tokens: number };
};

export type EmbeddingErrorResponse = {
  error: string;
};

export type EmbeddingOutcome = {
  status: number;
  body: EmbeddingSuccessResponse | EmbeddingErrorResponse;
};

function failure(status: number, message: string): EmbeddingOutcome {
  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "EMBEDDING_FAILURE",
    message: `${status}: ${message}`,
    level: "error",
  });
  return { status, body: { error: message } };
}

type OpenAiEmbeddingsResponse = {
  model: string;
  data: Array<{ index: number; embedding: number[] }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

/**
 * Stateless: converts normalized text into embeddings.
 * No database access, no status updates, no retries, no business logic.
 */
export async function generateEmbeddings(
  rawBody: unknown,
): Promise<EmbeddingOutcome> {
  const parsed = embeddingRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return failure(
      400,
      `Invalid request payload: ${parsed.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`,
    );
  }

  const { model: requestedModel, messages } = parsed.data;

  const model = (requestedModel ?? DEFAULT_EMBEDDING_MODEL).trim();
  if (
    !(SUPPORTED_EMBEDDING_MODELS as readonly string[]).includes(model)
  ) {
    return failure(
      400,
      `Unsupported embedding model "${model}". Supported models: ${SUPPORTED_EMBEDDING_MODELS.join(", ")}.`,
    );
  }

  const emptyIndex = messages.findIndex(
    (m) => m.normalized_text.trim().length === 0,
  );
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
      `Could not parse OpenAI response: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!Array.isArray(payload.data) || payload.data.length !== messages.length) {
    return failure(
      502,
      `OpenAI returned ${payload.data?.length ?? 0} embeddings for ${messages.length} inputs.`,
    );
  }

  const results: EmbeddingResult[] = [];
  for (const item of payload.data) {
    const source = messages[item.index];
    if (!source) {
      return failure(
        502,
        `OpenAI returned an embedding with out-of-range index ${item.index}.`,
      );
    }
    results.push({
      id: source.id,
      embedding: item.embedding,
      dimensions: item.embedding.length,
    });
  }
  results.sort(
    (a, b) =>
      messages.findIndex((m) => m.id === a.id) -
      messages.findIndex((m) => m.id === b.id),
  );

  const usage = {
    prompt_tokens: payload.usage?.prompt_tokens ?? 0,
    total_tokens: payload.usage?.total_tokens ?? 0,
  };

  DebugLogger.table({
    scope: LOG_SCOPE,
    event: "EMBEDDING_SUCCESSFUL",
    data: {
      totalMessages: messages.length,
      totalTokens: usage.prompt_tokens,
      model: payload.model ?? model,
    },
  });

  return {
    status: 200,
    body: {
      model: payload.model ?? model,
      results,
      usage,
    },
  };
}

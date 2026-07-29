import type { EmbeddingRequest, EmbeddingResult } from "../../types";

import type { OpenAiEmbeddingsResponse } from "./types";

export function mapOpenAiEmbeddingsToResults(
  messages: EmbeddingRequest["messages"],
  payload: OpenAiEmbeddingsResponse,
):
  | { ok: true; results: EmbeddingResult[]; usage: { prompt_tokens: number; total_tokens: number } }
  | { ok: false; status: number; message: string } {
  if (!Array.isArray(payload.data) || payload.data.length !== messages.length) {
    return {
      ok: false,
      status: 502,
      message: `OpenAI returned ${payload.data?.length ?? 0} embeddings for ${messages.length} inputs.`,
    };
  }

  const results: EmbeddingResult[] = [];
  for (const item of payload.data) {
    const source = messages[item.index];
    if (!source) {
      return {
        ok: false,
        status: 502,
        message: `OpenAI returned an embedding with out-of-range index ${item.index}.`,
      };
    }
    results.push({
      id: source.id,
      embedding: item.embedding,
      dimensions: item.embedding.length,
    });
  }

  results.sort(
    (a, b) => messages.findIndex((m) => m.id === a.id) - messages.findIndex((m) => m.id === b.id),
  );

  return {
    ok: true,
    results,
    usage: {
      prompt_tokens: payload.usage?.prompt_tokens ?? 0,
      total_tokens: payload.usage?.total_tokens ?? 0,
    },
  };
}

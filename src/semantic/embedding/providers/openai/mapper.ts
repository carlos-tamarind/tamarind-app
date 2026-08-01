import type { TextEmbedding } from "../../types";

import type { OpenAiEmbeddingsResponse } from "./types";

export function mapOpenAiEmbeddingsToVectors(
  inputCount: number,
  payload: OpenAiEmbeddingsResponse,
):
  | { ok: true; embeddings: TextEmbedding[]; usage: { prompt_tokens: number; total_tokens: number } }
  | { ok: false; status: number; message: string } {
  if (!Array.isArray(payload.data) || payload.data.length !== inputCount) {
    return {
      ok: false,
      status: 502,
      message: `OpenAI returned ${payload.data?.length ?? 0} embeddings for ${inputCount} inputs.`,
    };
  }

  const embeddings = new Array<TextEmbedding>(inputCount);
  for (const item of payload.data) {
    if (item.index < 0 || item.index >= inputCount) {
      return {
        ok: false,
        status: 502,
        message: `OpenAI returned an embedding with out-of-range index ${item.index}.`,
      };
    }
    embeddings[item.index] = {
      embedding: item.embedding,
      dimensions: item.embedding.length,
    };
  }

  return {
    ok: true,
    embeddings,
    usage: {
      prompt_tokens: payload.usage?.prompt_tokens ?? 0,
      total_tokens: payload.usage?.total_tokens ?? 0,
    },
  };
}

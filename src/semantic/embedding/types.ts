export type TextEmbedding = {
  embedding: number[];
  dimensions: number;
};

export type EmbedBatchSuccessResponse = {
  model: string;
  embeddings: TextEmbedding[];
  usage: { prompt_tokens: number; total_tokens: number };
};

export type EmbedErrorResponse = {
  error: string;
};

export type EmbedOutcome = {
  status: number;
  body: EmbedBatchSuccessResponse | EmbedErrorResponse;
};

export interface EmbeddingProvider {
  embedBatch(options: { model?: string; texts: string[] }): Promise<EmbedOutcome>;
}

export function isEmbedSuccess(
  outcome: EmbedOutcome,
): outcome is EmbedOutcome & { body: EmbedBatchSuccessResponse } {
  return outcome.status === 200 && "embeddings" in outcome.body;
}

export async function embed(
  provider: EmbeddingProvider,
  text: string,
  options?: { model?: string },
): Promise<EmbedOutcome> {
  return provider.embedBatch({ model: options?.model, texts: [text] });
}

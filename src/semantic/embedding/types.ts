import { z } from "zod";

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

export interface EmbeddingProvider {
  generate(request: EmbeddingRequest): Promise<EmbeddingOutcome>;
}

export function isEmbeddingSuccess(
  outcome: EmbeddingOutcome,
): outcome is EmbeddingOutcome & { body: EmbeddingSuccessResponse } {
  return outcome.status === 200 && "results" in outcome.body;
}

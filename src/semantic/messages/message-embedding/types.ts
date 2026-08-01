import { z } from "zod";

export const messageEmbeddingRequestSchema = z.object({
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

export type MessageEmbeddingRequest = z.infer<typeof messageEmbeddingRequestSchema>;

export type MessageEmbeddingResult = {
  id: string;
  embedding: number[];
  dimensions: number;
};

export type MessageEmbeddingSuccessResponse = {
  model: string;
  results: MessageEmbeddingResult[];
  usage: { prompt_tokens: number; total_tokens: number };
};

export type MessageEmbeddingErrorResponse = {
  error: string;
};

export type MessageEmbeddingOutcome = {
  status: number;
  body: MessageEmbeddingSuccessResponse | MessageEmbeddingErrorResponse;
};

export function isMessageEmbeddingSuccess(
  outcome: MessageEmbeddingOutcome,
): outcome is MessageEmbeddingOutcome & { body: MessageEmbeddingSuccessResponse } {
  return outcome.status === 200 && "results" in outcome.body;
}

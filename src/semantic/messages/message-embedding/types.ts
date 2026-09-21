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

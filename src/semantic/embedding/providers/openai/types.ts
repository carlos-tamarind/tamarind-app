export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export const SUPPORTED_EMBEDDING_MODELS = [
  "text-embedding-3-small",
  "text-embedding-3-large",
] as const;

export type SupportedEmbeddingModel = (typeof SUPPORTED_EMBEDDING_MODELS)[number];

export type OpenAiEmbeddingsResponse = {
  model: string;
  data: Array<{ index: number; embedding: number[] }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

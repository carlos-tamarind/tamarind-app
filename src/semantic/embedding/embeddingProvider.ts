import { openAiEmbeddingProvider } from "./providers/openai/embeddings.server";
import type { EmbeddingProvider } from "./types";

export type { EmbeddingProvider } from "./types";

/** Active embedding provider — swap here to change backend (e.g. Voyage, local). */
export const embeddingProvider: EmbeddingProvider = openAiEmbeddingProvider;

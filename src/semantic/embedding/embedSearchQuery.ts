import { embeddingProvider } from "./embeddingProvider";
import { embed, isEmbedSuccess } from "./types";

export async function embedSearchQuery(text: string): Promise<number[] | undefined> {
  const outcome = await embed(embeddingProvider, text);
  if (!isEmbedSuccess(outcome)) return undefined;
  return outcome.body.embeddings[0]?.embedding;
}

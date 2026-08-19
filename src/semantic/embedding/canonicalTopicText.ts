/** Canonical topic string used for conversation and page topic embeddings. */
export function canonicalTopicText(name: string, description: string): string {
  return `${name}: ${description}`;
}

/** pgvector literal format for Supabase client (inserts and RPC args). */
export function formatEmbeddingVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

/** Parse a pgvector literal (`[0.1,0.2,...]`) into a numeric array. */
export function parseEmbeddingVector(value: string): number[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new Error(`malformed embedding vector: expected [..] literal`);
  }

  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) return [];

  const values = inner.split(",").map((part) => Number(part.trim()));
  if (values.some((n) => !Number.isFinite(n))) {
    throw new Error(`malformed embedding vector: non-numeric component`);
  }
  return values;
}

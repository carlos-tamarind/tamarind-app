/** pgvector literal format for Supabase client (inserts and RPC args). */
export function formatEmbeddingVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

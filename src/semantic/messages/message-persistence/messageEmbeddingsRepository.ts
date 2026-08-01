export type InsertMessageEmbeddingInput = {
  message_semantics_id: string;
  model: string;
  dimensions: number;
  embedding_vector: string;
  is_active?: boolean;
};

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** pgvector insert format for Supabase client. */
export function formatEmbeddingVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

export async function insertMessageEmbedding(input: InsertMessageEmbeddingInput): Promise<void> {
  const supabase = await getAdmin();

  const { error } = await supabase.from("message_embeddings").insert({
    message_semantics_id: input.message_semantics_id,
    model: input.model,
    dimensions: input.dimensions,
    embedding_vector: input.embedding_vector,
    is_active: input.is_active ?? true,
  });

  if (error) throw error;
}

export async function findActiveEmbeddingBySemanticId(
  messageSemanticsId: string,
  model: string,
): Promise<{ id: string } | null> {
  const supabase = await getAdmin();

  const { data, error } = await supabase
    .from("message_embeddings")
    .select("id")
    .eq("message_semantics_id", messageSemanticsId)
    .eq("model", model)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

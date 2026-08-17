import type { Database } from "@/integrations/supabase/types";

export type PageChunkRow = Database["public"]["Tables"]["page_chunks"]["Row"];

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function findPageChunksByPageId(pageId: string): Promise<PageChunkRow[]> {
  const supabase = await getAdmin();
  const { data, error } = await supabase
    .from("page_chunks")
    .select("*")
    .eq("page_id", pageId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function deletePageChunksByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = await getAdmin();
  const { error } = await supabase.from("page_chunks").delete().in("id", ids);
  if (error) throw error;
}

export async function updatePageChunkPosition(id: string, position: number): Promise<void> {
  const supabase = await getAdmin();
  const { error } = await supabase.from("page_chunks").update({ position }).eq("id", id);
  if (error) throw error;
}

export async function touchPageChunks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = await getAdmin();
  const { error } = await supabase
    .from("page_chunks")
    .update({ updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}

export async function insertPageChunks(
  rows: Array<{
    page_id: string;
    position: number;
    content: string;
    checksum: string;
    token_count: number;
  }>,
): Promise<PageChunkRow[]> {
  if (rows.length === 0) return [];
  const supabase = await getAdmin();
  const { data, error } = await supabase.from("page_chunks").insert(rows).select("*");
  if (error) throw error;
  return data ?? [];
}

export async function insertQueuedPageEmbeddings(
  rows: Array<{
    chunk_id: string;
    checksum: string;
    embedding_model: string;
  }>,
): Promise<void> {
  if (rows.length === 0) return;
  const supabase = await getAdmin();
  const { error } = await supabase.from("page_embeddings").insert(
    rows.map((row) => ({
      chunk_id: row.chunk_id,
      checksum: row.checksum,
      embedding_model: row.embedding_model,
      embedding_status: "QUEUED" as const,
    })),
  );
  if (error) throw error;
}

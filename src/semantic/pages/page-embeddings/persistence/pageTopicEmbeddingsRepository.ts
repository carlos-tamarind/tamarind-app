import type { Database } from "@/integrations/supabase/types";
import { formatEmbeddingVector } from "@/lib/vector/embeddingVectorUtil";

import { PAGE_EMBEDDING_CONFIG } from "../worker/config";
import { formatStaleAfterInterval } from "../worker/retry";

export type PageTopicEmbeddingRow = Database["public"]["Tables"]["page_topic_embeddings"]["Row"];

export type PageTopicText = {
  id: string;
  topic_name: string;
  topic_description: string;
};

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function claimPageTopicEmbeddingBatch(
  batchSize = PAGE_EMBEDDING_CONFIG.PAGE_EMBEDDING_BATCH_SIZE,
): Promise<PageTopicEmbeddingRow[]> {
  const supabase = await getAdmin();
  const { data, error } = await supabase.rpc("claim_page_topic_embedding_batch", {
    p_batch_size: batchSize,
    p_stale_after: formatStaleAfterInterval(),
  });
  if (error) throw error;
  return (data ?? []) as PageTopicEmbeddingRow[];
}

export async function loadPageTopicsByIds(
  pageTopicIds: string[],
): Promise<Map<string, PageTopicText>> {
  if (pageTopicIds.length === 0) return new Map();
  const supabase = await getAdmin();
  const { data, error } = await supabase
    .from("page_topics")
    .select("id, topic_name, topic_description")
    .in("id", pageTopicIds);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row as PageTopicText]));
}

/**
 * Heartbeat: any UPDATE fires `trg_page_topic_embeddings_updated_at`, keeping
 * the row out of stale-PROCESSING recovery while a long embed call is in flight.
 */
export async function touchPageTopicEmbeddings(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = await getAdmin();
  const { error } = await supabase
    .from("page_topic_embeddings")
    .update({ updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}

/**
 * Guarded persist: only writes when the row is still PROCESSING with the same
 * checksum. Returns false when the row drifted (requeued, deleted).
 */
export async function persistPageTopicEmbedding(options: {
  id: string;
  checksum: string;
  embedding: number[];
}): Promise<boolean> {
  const supabase = await getAdmin();
  const { data, error } = await supabase
    .from("page_topic_embeddings")
    .update({
      embedding: formatEmbeddingVector(options.embedding),
      embedding_status: "EMBEDDED",
      embedded_at: new Date().toISOString(),
      attempts: 0,
      last_error: null,
      next_retry_at: null,
    })
    .eq("id", options.id)
    .eq("embedding_status", "PROCESSING")
    .eq("checksum", options.checksum)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function requeuePageTopicEmbedding(options: {
  id: string;
  attempts: number;
  nextRetryAt: Date;
  lastError: string;
}): Promise<void> {
  const supabase = await getAdmin();
  const { error } = await supabase
    .from("page_topic_embeddings")
    .update({
      embedding_status: "RETRY_WAIT",
      attempts: options.attempts,
      next_retry_at: options.nextRetryAt.toISOString(),
      last_error: options.lastError.slice(0, 500),
    })
    .eq("id", options.id);
  if (error) throw error;
}

export async function markPageTopicEmbeddingFailed(id: string, lastError: string): Promise<void> {
  const supabase = await getAdmin();
  const { error } = await supabase
    .from("page_topic_embeddings")
    .update({
      embedding_status: "FAILED",
      next_retry_at: null,
      last_error: lastError.slice(0, 500),
    })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Return a claimed row to the queue without counting it as a failure. When the
 * live canonical checksum drifted, store it so the next tick embeds the right text.
 */
export async function releasePageTopicEmbedding(id: string, checksum?: string): Promise<void> {
  const supabase = await getAdmin();
  const { error } = await supabase
    .from("page_topic_embeddings")
    .update({
      embedding_status: "QUEUED",
      next_retry_at: null,
      ...(checksum ? { checksum } : {}),
    })
    .eq("id", id)
    .eq("embedding_status", "PROCESSING");
  if (error) throw error;
}

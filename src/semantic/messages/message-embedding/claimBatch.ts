import type { MessageSemantics } from "@/semantic/messages/message-persistence/types";

import { EMBEDDING_CONFIG } from "./config";
import { formatStaleAfterInterval } from "./retry";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function claimEmbeddingBatch(
  batchSize = EMBEDDING_CONFIG.EMBEDDING_BATCH_SIZE,
): Promise<MessageSemantics[]> {
  const supabase = await getAdmin();

  const { data, error } = await supabase.rpc("claim_embedding_batch", {
    p_batch_size: batchSize,
    p_stale_after: formatStaleAfterInterval(),
  });

  if (error) throw error;
  return (data ?? []) as MessageSemantics[];
}

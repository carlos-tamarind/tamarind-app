import type { Database } from "@/integrations/supabase/types";

import {
  PAGE_CHUNK_CONFIG,
  PAGE_CHUNKING_IDLE_INTERVAL,
} from "../engine/config";

export type DuePage = Database["public"]["Functions"]["list_pages_due_for_chunking"]["Returns"][number];

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function listPagesDueForChunking(): Promise<DuePage[]> {
  const supabase = await getAdmin();
  const { data, error } = await supabase.rpc("list_pages_due_for_chunking", {
    p_idle: PAGE_CHUNKING_IDLE_INTERVAL,
    p_limit: PAGE_CHUNK_CONFIG.PAGE_CHUNKING_BATCH_SIZE,
  });
  if (error) throw error;
  return data ?? [];
}

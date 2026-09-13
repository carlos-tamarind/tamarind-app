import type { Json } from "@/integrations/supabase/types";

import type { ApplyCanonicalTopicResult } from "../../types/job";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type CanonicalTopicAddPayload = {
  decision: "create" | "reinforce";
  canonical_topic_id?: string;
  name: string;
  description: string;
  embedding: number[];
  embedding_model?: string;
  owning_entity_id: string;
  similarity?: number;
  update_embedding?: boolean;
};

function toJsonPayload(payload: CanonicalTopicAddPayload): Json {
  return JSON.parse(JSON.stringify(payload)) as Json;
}

export async function applyCanonicalTopicAdd(
  jobId: string,
  payload: CanonicalTopicAddPayload,
): Promise<ApplyCanonicalTopicResult> {
  const supabase = await getAdmin();

  const { data, error } = await supabase.rpc("apply_canonical_topic_add_and_commit", {
    p_job_id: jobId,
    p_result: toJsonPayload(payload),
  });

  if (error) throw error;
  return data as ApplyCanonicalTopicResult;
}

export async function applyCanonicalTopicRemove(jobId: string): Promise<ApplyCanonicalTopicResult> {
  const supabase = await getAdmin();

  const { data, error } = await supabase.rpc("apply_canonical_topic_remove_and_commit", {
    p_job_id: jobId,
  });

  if (error) throw error;
  return data as ApplyCanonicalTopicResult;
}
